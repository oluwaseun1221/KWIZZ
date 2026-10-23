// Quiz.js
import React, { useState, useEffect, useCallback } from "react";
import { useUser, useAuth } from "@clerk/clerk-react"; // ✅ Clerk user + token
import { useNavigate } from "react-router-dom";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.entry";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Seconds per question for each difficulty
const TIME_BY_DIFFICULTY = { easy: 30, medium: 20, hard: 15 };

function Quiz({
  setScore,
  onFinish,
  setTotalQuestions,
  setQuizId,
  setUserAnswers,
  setQuestions,
  difficulty: difficultyProp,
}) {
  const navigate = useNavigate();
  const { user } = useUser();
  const { getToken } = useAuth();

  // Difficulty chosen on the Home page (saved in localStorage)
  const difficulty =
    difficultyProp || localStorage.getItem("quizDifficulty") || "easy";
  const timeSettings = TIME_BY_DIFFICULTY[difficulty] || 30;

  const [questions, setLocalQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [theoryAnswer, setTheoryAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [timeLeft, setTimeLeft] = useState(timeSettings);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState(false);
  const [localUserAnswers, setLocalUserAnswers] = useState({});
  const [quizId, setLocalQuizId] = useState(null);

  // ✅ Fetch quiz from backend
  const fetchQuiz = async (quizId) => {
    try {
      setStatusMsg("📥 Fetching quiz from server...");
      const res = await fetch(`http://127.0.0.1:8000/get_quiz/${quizId}`);
      if (!res.ok) throw new Error("Failed to fetch quiz");
      const data = await res.json();

      if (!data.questions || data.questions.length === 0) {
        throw new Error("No questions generated.");
      }

      setLocalQuestions(data.questions);
      if (setQuestions) setQuestions(data.questions);
      setTotalQuestions(data.questions.length);
      setStatusMsg("");
      setError(false);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching quiz:", err);
      setStatusMsg("❌ Failed to load quiz.");
      setError(true);
      setLoading(false);
    }
  };

  // ✅ File upload handler
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setStatusMsg("⏳ Processing file...");
    setError(false);

    let extractedText = "";

    try {
      // PDF Processing
      if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          extractedText += textContent.items.map((item) => item.str).join(" ") + " ";
        }
      }
      // DOCX Processing
      else if (
        file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
      }
      // Plain text
      else if (file.type === "text/plain") {
        extractedText = await file.text();
      } else {
        throw new Error("Unsupported file type. Please upload PDF, DOCX, or TXT files.");
      }

      if (!extractedText.trim()) {
        throw new Error("No text content found in the file.");
      }

      setStatusMsg("📤 Generating quiz...");

      const token = await getToken().catch(() => null);
      const res = await fetch("http://127.0.0.1:8000/generate_quiz_from_text/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          text: extractedText,
          difficulty: difficulty || "easy",
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || "Quiz generation failed");
      }
      const data = await res.json();

      if (!data.quiz_id) throw new Error("Invalid response from backend");

      setLocalQuizId(data.quiz_id);
      if (setQuizId) setQuizId(data.quiz_id);

      fetchQuiz(data.quiz_id);
    } catch (err) {
      console.error("Upload error:", err);
      setStatusMsg(`❌ ${err.message || "File processing failed. Please try again."}`);
      setError(true);
      setLoading(false);
    }
  };

  // ✅ MCQ answer handler
  const handleAnswer = useCallback(
    (answer) => {
      setSelectedAnswer(answer);
      const q = questions[currentIndex];
      const correct = q.answers.find((a) => a.is_correct);

      const answerData = {
        question_text: q.question_text,
        answer_text: answer.answer_text,
        is_correct: answer.id === correct.id || answer.is_correct,
        correct_answer: correct.answer_text,
      };

      setLocalUserAnswers((prev) => ({
        ...prev,
        [q.id || currentIndex + 1]: answerData,
      }));

      if (setUserAnswers) {
        setUserAnswers((prev) => ({
          ...prev,
          [q.id || currentIndex + 1]: answerData,
        }));
      }

      if (answer.id === correct.id || answer.is_correct) {
        setFeedback("✅ Correct!");
        setScore((prev) => prev + 1);
      } else {
        setFeedback(`❌ Wrong! Correct answer: ${correct.answer_text}`);
      }
    },
    [questions, currentIndex, setScore, setUserAnswers]
  );

  // ✅ Submit all answers + Auto-save score
  const handleSubmitAll = useCallback(() => {
    if (onFinish) {
      onFinish(localUserAnswers);
    }

    const percentage =
      questions.length > 0
        ? Math.round((Object.values(localUserAnswers).filter((a) => a.is_correct).length / questions.length) * 100)
        : 0;

    // Save the score once. The login token (if any) lets the backend attach
    // the score to this user's account.
    const saveScore = async () => {
      const token = await getToken().catch(() => null);
      await fetch("http://127.0.0.1:8000/save_score", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name:
            user?.fullName ||
            user?.username ||
            user?.primaryEmailAddress?.emailAddress ||
            "Anonymous",
          score: Object.values(localUserAnswers).filter((a) => a.is_correct).length,
          total: questions.length,
          percentage: percentage,
          difficulty: difficulty,
          quiz_id: quizId || "N/A",
        }),
      });
    };
    saveScore().catch((err) => console.error("Leaderboard save failed:", err));

    navigate("/results");
  }, [onFinish, localUserAnswers, navigate, questions, difficulty, quizId, user, getToken]);

  // ✅ Next button handler
  const handleNext = useCallback(() => {
    const q = questions[currentIndex];
    if (q?.type === "mcq" && !selectedAnswer && !localUserAnswers[q.id || currentIndex + 1]) {
      setFeedback("⚠️ Please select an answer before proceeding.");
      return;
    }

    setFeedback("");
    setSelectedAnswer(null);
    setTheoryAnswer("");
    setTimeLeft(timeSettings);

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((i) => i + 1);
    } else {
      handleSubmitAll();
    }
  }, [currentIndex, questions, selectedAnswer, localUserAnswers, timeSettings, handleSubmitAll]);

  // ✅ Theory save handler
  const handleSaveTheory = useCallback(() => {
    const q = questions[currentIndex];
    if (!q || !theoryAnswer.trim()) {
      setFeedback("⚠️ Please enter an answer before proceeding.");
      return;
    }

    const answerData = {
      question_text: q.question_text,
      answer_text: theoryAnswer,
      is_correct: null,
      correct_answer: null,
    };

    setLocalUserAnswers((prev) => ({
      ...prev,
      [q.id || currentIndex + 1]: answerData,
    }));

    if (setUserAnswers) {
      setUserAnswers((prev) => ({
        ...prev,
        [q.id || currentIndex + 1]: answerData,
      }));
    }

    setTheoryAnswer("");
    setFeedback("💾 Answer saved!");

    setTimeout(() => handleNext(), 500);
  }, [questions, currentIndex, theoryAnswer, setUserAnswers, handleNext]);

  // Timer
  useEffect(() => {
    if (!questions.length || loading) return;

    if (timeLeft <= 0) {
      if (questions[currentIndex]?.type === "theory") {
        if (theoryAnswer.trim()) {
          handleSaveTheory();
        } else {
          handleNext();
        }
      } else {
        handleNext();
      }
      return;
    }

    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, handleNext, handleSaveTheory, questions, currentIndex, loading, theoryAnswer]);

  // === UI ===
  if (loading || questions.length === 0) {
    return (
      <div className="quiz-upload">
        <h2>📂 Upload a file to start your quiz</h2>
        <p>Supported formats: PDF, DOCX, TXT</p>
        <input type="file" accept=".pdf,.docx,.txt" onChange={handleFileUpload} disabled={loading} />
        {statusMsg && <p className={`status-message ${error ? "error" : ""}`}>{statusMsg}</p>}
        {loading && <div className="spinner">Loading...</div>}
        {error && (
          <button
            className="retry-btn"
            onClick={() => {
              setError(false);
              setStatusMsg("");
            }}
          >
            🔄 Try Again
          </button>
        )}
      </div>
    );
  }

  const q = questions[currentIndex];
  const isAnswered = localUserAnswers[q?.id || currentIndex + 1];

  return (
    <div className="quiz-container">
      <div className="quiz-header">
        <h2>
          Question {currentIndex + 1} of {questions.length}
        </h2>
        <p className="timer">⏳ Time left: {timeLeft}s</p>
      </div>

      <div className="question-content">
        <p className="question-text">{q.question_text}</p>

        {q.type === "mcq" && (
          <ul className="quiz-options">
            {q.answers.map((a) => (
              <li key={a.id}>
                <button
                  disabled={!!selectedAnswer || !!isAnswered}
                  className={`option-btn ${selectedAnswer?.id === a.id ? "selected" : ""} ${
                    isAnswered?.answer_text === a.answer_text ? "answered" : ""
                  }`}
                  onClick={() => handleAnswer(a)}
                >
                  {a.answer_text}
                </button>
              </li>
            ))}
          </ul>
        )}

        {q.type === "theory" && (
          <div className="theory-section">
            <textarea
              value={theoryAnswer}
              onChange={(e) => setTheoryAnswer(e.target.value)}
              placeholder="Type your answer here..."
              rows="6"
              disabled={!!isAnswered}
            />
            {!isAnswered && (
              <button className="save-btn" onClick={handleSaveTheory} disabled={!theoryAnswer.trim()}>
                💾 Save Answer
              </button>
            )}
          </div>
        )}

        {feedback && (
          <p className={`feedback ${feedback.includes("✅") ? "correct" : "incorrect"}`}>{feedback}</p>
        )}
      </div>

      <div className="quiz-navigation">
        {currentIndex < questions.length - 1 ? (
          <button
            className="next-btn"
            onClick={handleNext}
            disabled={q.type === "mcq" && !selectedAnswer && !isAnswered}
          >
            Next ➡
          </button>
        ) : (
          <button
            className="submit-btn"
            onClick={handleSubmitAll}
            disabled={q.type === "mcq" && !selectedAnswer && !isAnswered}
          >
            ✅ Submit Quiz
          </button>
        )}
      </div>

      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

export default Quiz;
