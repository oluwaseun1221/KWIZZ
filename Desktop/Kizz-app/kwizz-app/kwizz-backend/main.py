from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
import random, sqlite3, json, datetime
import requests
import os
from typing import List

# ✅ Import the new utility file for text extraction
from utils import extract_text_from_file

app = FastAPI()

# === CORS Setup ===
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === SQLite Setup ===
DB_FILE = "quizzes.db"

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
    conn.commit()
    conn.close()

init_db()

# === Clerk Authentication Setup ===
CLERK_API_KEY = os.getenv("CLERK_API_KEY")
CLERK_JWKS_URL = "https://api.clerk.dev/v1/jwks"
auth_scheme = HTTPBearer()

def verify_clerk_token(token: str):
    if not CLERK_API_KEY:
        raise HTTPException(status_code=500, detail="Server not configured for authentication")
    
    resp = requests.get(
        CLERK_JWKS_URL,
        headers={"Authorization": f"Bearer {CLERK_API_KEY}"}
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Clerk token")
    return True

# === Models ===
class QuizRequest(BaseModel):
    text: str
    difficulty: str = "easy"
    num_questions: int = 20

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
def save_quiz(quiz_id: str, questions: list):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO quizzes (id, questions) VALUES (?, ?)",
        (quiz_id, json.dumps(questions))
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

# === Routes ===
@app.get("/")
async def root():
    return {"message": "FastAPI Quiz Backend 🚀 (MCQ + Theory + Leaderboard + Custom Quizzes)"}

@app.post("/generate_quiz_from_text/")
async def generate_quiz_from_text(req: QuizRequest):
    raw_text = req.text.strip()
    difficulty = req.difficulty.lower()
    num_questions = req.num_questions

    sentences = [s.strip() for s in raw_text.split(".") if len(s.strip()) > 10]
    questions = []
    q_id = 1
    random.shuffle(sentences)

    for s in sentences:
        if len(questions) >= num_questions:
            break
        
        words = s.split()
        if len(words) < 5:
            continue

        answer_word = random.choice(words)
        question_text = s.replace(answer_word, "_____")
        
        valid_fake_opts = [w for w in words if w != answer_word and len(w) > 3]
        if len(valid_fake_opts) < 3:
            fake_opts = random.sample(
                ["Option A", "Option B", "Option C", "Option D"], min(3, len(valid_fake_opts) + 1)
            )
        else:
            fake_opts = random.sample(valid_fake_opts, 3)

        options = [answer_word] + fake_opts
        random.shuffle(options)

        answers = [
            {"id": f"a{i+1}", "answer_text": opt, "is_correct": (opt == answer_word)}
            for i, opt in enumerate(options)
        ]

        questions.append({
            "id": q_id,
            "type": "mcq",
            "question_text": question_text,
            "answers": answers
        })
        q_id += 1
    
    if len(questions) < num_questions:
        pass

    quiz_id = f"quiz-{random.randint(1000,9999)}"
    save_quiz(quiz_id, questions)

    return {"quiz_id": quiz_id, "questions": questions}


# ✅ New endpoint to handle file uploads
@app.post("/generate_quiz_from_file/")
async def generate_quiz_from_file(file: UploadFile = File(...), difficulty: str = "easy"):
    try:
        raw_text = await extract_text_from_file(file)
        if not raw_text:
            raise HTTPException(status_code=400, detail="Could not extract text from file.")

        return await generate_quiz_from_text(QuizRequest(text=raw_text, difficulty=difficulty))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred: {e}")

@app.get("/get_quiz/{quiz_id}")
async def get_quiz(quiz_id: str):
    return load_quiz(quiz_id)

# === Custom Quiz Routes ===
@app.post("/create_custom_quiz/")
async def create_custom_quiz(
    quiz: QuizCreate,
    auth_verified: bool = Depends(verify_clerk_token)
):
    quiz_id = f"custom-{random.randint(1000,9999)}"
    questions_list = [q.dict() for q in quiz.questions]
    save_quiz(quiz_id, questions_list)
    return {"quiz_id": quiz_id, "title": quiz.title}

@app.get("/get_custom_quiz/{quiz_id}")
async def get_custom_quiz(quiz_id: str):
    return load_quiz(quiz_id)

# === Leaderboard Routes ===
@app.post("/save_score")
async def save_score(req: ScoreRequest):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO leaderboard (name, score, total, percentage, difficulty, quiz_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        req.name, req.score, req.total, req.percentage,
        req.difficulty, req.quiz_id, datetime.datetime.utcnow()
    ))
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Score saved ✅"}

@app.get("/get_leaderboard")
async def get_leaderboard():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT name, score, total, percentage, difficulty, quiz_id, created_at
        FROM leaderboard
        ORDER BY percentage DESC, created_at ASC
        LIMIT 20
    """)
    rows = cursor.fetchall()
    conn.close()

    leaderboard = [
        {
            "name": row[0],
            "score": row[1],
            "total": row[2],
            "percentage": row[3],
            "difficulty": row[4],
            "quiz_id": row[5],
            "created_at": row[6],
        }
        for row in rows
    ]
    return {"leaderboard": leaderboard}