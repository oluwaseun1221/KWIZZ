import asyncio
import datetime
import json
import os
import random
import re
import sqlite3
import uuid
from typing import List, Optional

import jwt
import requests
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jwt import PyJWKClient
from pydantic import BaseModel

from utils import extract_text_from_file

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Loads kwizz-backend/.env (CLERK_JWKS_URL, ANTHROPIC_API_KEY, ...) so you
# don't have to re-type `$env:...` in every new terminal.
try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(BASE_DIR, ".env"))
except ImportError:
    # python-dotenv isn't installed: the app still runs, but then you must set
    # CLERK_JWKS_URL / ANTHROPIC_API_KEY as normal environment variables.
    pass

app = FastAPI()

# === CORS Setup ===
# Only your frontend may call this API. Add more origins (comma separated)
# with the ALLOWED_ORIGINS environment variable when you deploy.
_default_origins = "http://localhost:3000,http://127.0.0.1:3000"
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,  # we use Authorization headers, not cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

# === SQLite Setup ===
DB_FILE = os.path.join(BASE_DIR, "quizzes.db")


def _add_column_if_missing(cursor, table: str, column: str, ddl: str):
    """Tiny migration helper so existing quizzes.db files keep working."""
    cols = [row[1] for row in cursor.execute(f"PRAGMA table_info({table})")]
    if column not in cols:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS quizzes (
            id TEXT PRIMARY KEY,
            questions TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS leaderboard (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            score INTEGER,
            total INTEGER,
            percentage INTEGER,
            difficulty TEXT,
            quiz_id TEXT,
            created_at TIMESTAMP
        )
    """)

    # New columns: who owns a quiz / who earned a score.
    _add_column_if_missing(cursor, "quizzes", "title", "TEXT")
    _add_column_if_missing(cursor, "quizzes", "user_id", "TEXT")
    _add_column_if_missing(cursor, "quizzes", "created_at", "TEXT")
    _add_column_if_missing(cursor, "leaderboard", "user_id", "TEXT")

    conn.commit()
    conn.close()


init_db()

# === Clerk Authentication ===
# CLERK_JWKS_URL looks like:
#   https://<your-frontend-api>.clerk.accounts.dev/.well-known/jwks.json
CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL")
_jwk_client = PyJWKClient(CLERK_JWKS_URL) if CLERK_JWKS_URL else None

auth_scheme = HTTPBearer()                      # token required
optional_scheme = HTTPBearer(auto_error=False)  # token optional


def _decode_token(token: str) -> dict:
    signing_key = _jwk_client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        options={"verify_aud": False},  # Clerk session tokens don't set aud by default
    )


def verify_clerk_token(credentials: HTTPAuthorizationCredentials = Depends(auth_scheme)) -> dict:
    """Requires a valid Clerk session token. Returns the decoded payload (`sub` = user id)."""
    if not _jwk_client:
        raise HTTPException(
            status_code=500,
            detail="Server not configured for authentication (CLERK_JWKS_URL missing)",
        )
    try:
        return _decode_token(credentials.credentials)
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {e}")


def get_optional_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_scheme),
) -> Optional[str]:
    """Returns the Clerk user id if a valid token was sent, otherwise None (never errors)."""
    if not credentials or not _jwk_client:
        return None
    try:
        return _decode_token(credentials.credentials).get("sub")
    except jwt.PyJWTError:
        return None


# === Models ===
class QuizRequest(BaseModel):
    text: str
    difficulty: str = "easy"
    num_questions: int = 10


class ScoreRequest(BaseModel):
    name: str
    score: int
    total: int
    percentage: int
    difficulty: str
    quiz_id: str


class AnswerIn(BaseModel):
    id: str
    answer_text: str
    is_correct: bool


class QuestionIn(BaseModel):
    id: int
    type: str
    question_text: str
    answers: List[AnswerIn]


class QuizCreate(BaseModel):
    title: str
    questions: List[QuestionIn]


# === Helpers ===
def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def save_quiz(quiz_id: str, questions: list, title: Optional[str] = None, user_id: Optional[str] = None):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO quizzes (id, questions, title, user_id, created_at) VALUES (?, ?, ?, ?, ?)",
        (quiz_id, json.dumps(questions), title, user_id, _now()),
    )
    conn.commit()
    conn.close()


def load_quiz(quiz_id: str):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT questions FROM quizzes WHERE id=?", (quiz_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return {"quiz_id": quiz_id, "questions": json.loads(row[0])}
    return {"quiz_id": quiz_id, "questions": []}


def _clean_word(w: str) -> str:
    return w.strip(".,;:!?()[]{}\"'“”‘’")


# --- Basic (no-AI) generator: fill-in-the-blank. Used as a fallback. ---
def generate_basic_questions(text: str, difficulty: str, num_questions: int) -> list:
    sentences = [s.strip() for s in re.split(r"[.!?]\s+|\n+", text) if len(s.strip()) > 10]
    random.shuffle(sentences)

    vocab = sorted({_clean_word(w) for w in text.split() if len(_clean_word(w)) > 3})
    questions = []

    for s in sentences:
        if len(questions) >= num_questions:
            break

        words = s.split()
        if len(words) < 5:
            continue

        candidates = [_clean_word(w) for w in words if len(_clean_word(w)) > 3]
        if not candidates:
            continue

        # prefer meaningful (longer) words as the blank; skip tiny filler words
        meaningful = [w for w in candidates if len(w) >= 6]
        answer = random.choice(meaningful or candidates)
        pattern = r"\b" + re.escape(answer) + r"\b"
        question_text, n_subs = re.subn(pattern, "_____", s, count=1)
        if n_subs == 0:
            continue

        # Wrong options: other words from this sentence first, then the whole text.
        pool = [w for w in dict.fromkeys(candidates) if w.lower() != answer.lower() and len(w) >= 5]
        extra = [w for w in vocab if w.lower() != answer.lower() and w not in pool and len(w) >= 5]
        random.shuffle(extra)
        pool += extra
        if difficulty == "hard":
            # harder: distractors that look similar to the answer (similar length)
            pool.sort(key=lambda w: abs(len(w) - len(answer)))
        else:
            random.shuffle(pool)
        fake_opts = pool[:3]
        if len(fake_opts) < 3:
            continue

        options = [answer] + fake_opts
        random.shuffle(options)
        questions.append({
            "id": len(questions) + 1,
            "type": "mcq",
            "question_text": question_text,
            "answers": [
                {"id": f"a{i + 1}", "answer_text": opt, "is_correct": (opt == answer)}
                for i, opt in enumerate(options)
            ],
        })

    return questions


# --- AI generator (Anthropic API). Used when ANTHROPIC_API_KEY is set. ---
AI_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-5-5")
AI_MAX_INPUT_CHARS = 12000

DIFFICULTY_GUIDE = {
    "easy": "Test direct recall of facts clearly stated in the text. Wrong options should be clearly different.",
    "medium": "Test understanding: reasons, relationships and comparisons between ideas in the text. Wrong options should be plausible.",
    "hard": "Test deeper understanding, inference and application of the text's ideas. Wrong options must be very plausible and close to the correct answer.",
}


def _parse_json_array(raw: str) -> list:
    raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("No JSON array found in AI response")
    return json.loads(raw[start:end + 1])


def generate_ai_questions(text: str, difficulty: str, num_questions: int) -> Optional[list]:
    """Returns a list of MCQ questions, or None if no API key is configured.
    Raises on any API/parsing problem so the caller can fall back."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    guide = DIFFICULTY_GUIDE.get(difficulty, DIFFICULTY_GUIDE["easy"])
    prompt = (
        f"Write {num_questions} multiple-choice quiz questions based ONLY on the study text below.\n"
        f"Difficulty: {difficulty}. {guide}\n\n"
        "Rules:\n"
        "- Every question must be answerable from the text alone.\n"
        "- Exactly 4 options per question, only one correct.\n"
        "- Vary which position the correct option is in. No 'all of the above' / 'none of the above'.\n"
        "- Do not reference 'the text' or 'the passage' in the question wording.\n"
        "- Respond with ONLY a JSON array, no other text, in this shape:\n"
        '[{"question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0}]\n\n'
        f"STUDY TEXT:\n{text[:AI_MAX_INPUT_CHARS]}"
    )

    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": AI_MODEL,
            "max_tokens": 4000,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=90,
    )
    resp.raise_for_status()
    blocks = resp.json().get("content", [])
    raw = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")

    questions = []
    for item in _parse_json_array(raw):
        options = item.get("options")
        correct = item.get("correct_index")
        question = str(item.get("question", "")).strip()
        if (
            not question
            or not isinstance(options, list)
            or len(options) != 4
            or not isinstance(correct, int)
            or not 0 <= correct < 4
        ):
            continue
        questions.append({
            "id": len(questions) + 1,
            "type": "mcq",
            "question_text": question,
            "answers": [
                {"id": f"a{i + 1}", "answer_text": str(opt), "is_correct": (i == correct)}
                for i, opt in enumerate(options)
            ],
        })

    if not questions:
        raise ValueError("AI returned no valid questions")
    return questions[:num_questions]


async def _build_quiz(req: QuizRequest, user_id: Optional[str]):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="No text provided.")

    difficulty = req.difficulty.lower()
    num_questions = max(1, min(req.num_questions, 30))

    questions = None
    generator = "basic"
    try:
        # requests is blocking, so run it in a worker thread
        questions = await asyncio.to_thread(generate_ai_questions, text, difficulty, num_questions)
        if questions:
            generator = "ai"
    except Exception as e:
        print(f"[quiz] AI generation failed, using basic generator: {e}")
        questions = None

    if not questions:
        questions = generate_basic_questions(text, difficulty, num_questions)

    if not questions:
        raise HTTPException(
            status_code=400,
            detail="Couldn't make questions from that text. Try a longer text with full sentences.",
        )

    quiz_id = f"quiz-{uuid.uuid4().hex[:8]}"
    save_quiz(quiz_id, questions, user_id=user_id)
    return {"quiz_id": quiz_id, "questions": questions, "generator": generator}


# === Routes ===
@app.get("/")
async def root():
    return {"message": "FastAPI Quiz Backend 🚀 (MCQ + Theory + Leaderboard + Custom Quizzes)"}


@app.post("/generate_quiz_from_text/")
async def generate_quiz_from_text(
    req: QuizRequest,
    user_id: Optional[str] = Depends(get_optional_user_id),
):
    return await _build_quiz(req, user_id)


@app.post("/generate_quiz_from_file/")
async def generate_quiz_from_file(
    file: UploadFile = File(...),
    difficulty: str = "easy",
    user_id: Optional[str] = Depends(get_optional_user_id),
):
    raw_text = await extract_text_from_file(file)
    if not raw_text or not raw_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file.")
    return await _build_quiz(QuizRequest(text=raw_text, difficulty=difficulty), user_id)


@app.get("/get_quiz/{quiz_id}")
async def get_quiz(quiz_id: str):
    return load_quiz(quiz_id)


# === Custom Quiz Routes ===
@app.post("/create_custom_quiz/")
async def create_custom_quiz(quiz: QuizCreate, token_payload: dict = Depends(verify_clerk_token)):
    quiz_id = f"custom-{uuid.uuid4().hex[:8]}"
    questions_list = [q.dict() for q in quiz.questions]
    save_quiz(quiz_id, questions_list, title=quiz.title, user_id=token_payload.get("sub"))
    return {"quiz_id": quiz_id, "title": quiz.title}


@app.get("/get_custom_quiz/{quiz_id}")
async def get_custom_quiz(quiz_id: str):
    return load_quiz(quiz_id)


@app.get("/my_quizzes")
async def my_quizzes(token_payload: dict = Depends(verify_clerk_token)):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, title, questions, created_at FROM quizzes WHERE user_id = ? ORDER BY created_at DESC",
        (token_payload.get("sub"),),
    )
    rows = cursor.fetchall()
    conn.close()
    return {
        "quizzes": [
            {
                "quiz_id": r[0],
                "title": r[1],
                "num_questions": len(json.loads(r[2])),
                "created_at": r[3],
            }
            for r in rows
        ]
    }


# === Leaderboard Routes ===
@app.post("/save_score")
async def save_score(req: ScoreRequest, user_id: Optional[str] = Depends(get_optional_user_id)):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO leaderboard (name, score, total, percentage, difficulty, quiz_id, created_at, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (req.name, req.score, req.total, req.percentage, req.difficulty, req.quiz_id, _now(), user_id),
    )
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Score saved ✅"}


def _rows_to_entries(rows):
    return [
        {
            "name": r[0],
            "score": r[1],
            "total": r[2],
            "percentage": r[3],
            "difficulty": r[4],
            "quiz_id": r[5],
            "created_at": r[6],
        }
        for r in rows
    ]


@app.get("/get_leaderboard")
async def get_leaderboard():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT name, score, total, percentage, difficulty, quiz_id, created_at
        FROM leaderboard
        ORDER BY percentage DESC, created_at ASC
        LIMIT 20
        """
    )
    rows = cursor.fetchall()
    conn.close()
    return {"leaderboard": _rows_to_entries(rows)}


@app.get("/my_scores")
async def my_scores(token_payload: dict = Depends(verify_clerk_token)):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT name, score, total, percentage, difficulty, quiz_id, created_at
        FROM leaderboard
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
        """,
        (token_payload.get("sub"),),
    )
    rows = cursor.fetchall()
    conn.close()
    return {"leaderboard": _rows_to_entries(rows)}
