// Results.js
import React, { useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { Link } from "react-router-dom";

function Results({ score, total, onRestart, userAnswers, quizId }) {
  const { user } = useUser();
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

  // ✅ Save score to backend leaderboard
  useEffect(() => {
    if (!user) return;

    const saveScore = async () => {
      try {
        await fetch("http://127.0.0.1:8000/save_score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name:
              user.fullName ||
              user.username ||
              user.primaryEmailAddress?.emailAddress ||
              "Anonymous",
            score,
            total,
            percentage,
            difficulty: localStorage.getItem("quizDifficulty") || "easy",
            quiz_id: quizId,
          }),
        });
      } catch (err) {
        console.error("Error saving score:", err);
      }
    };

    saveScore();
  }, [score, total, quizId, user, percentage]);

  return (
    <div className="results-container">
      <h2 className="results-title">Quiz Results 🎉</h2>

      <p className="results-score">
        You scored <span>{score}</span> out of {total}
      </p>

      <p className="results-percentage">{percentage}% correct</p>

      <p className="results-note">
        Difficulty: <strong>{localStorage.getItem("quizDifficulty")}</strong>
      </p>

      <p style={{ marginTop: "1rem", fontStyle: "italic", color: "#10b981" }}>
        ✅ Your score has been saved to the leaderboard
      </p>

      {/* ✅ Show logged in user */}
      {user && (
        <p className="results-note">
          Logged in as <strong>{user.fullName || user.username}</strong>
        </p>
      )}

      {/* ✅ Review Answers */}
      <div className="results-details">
        <h3>Review:</h3>
        {Object.values(userAnswers).map((ans, idx) => (
          <div key={idx} className="result-item">
            <h3>{ans.question_text}</h3>
            <p>
              Your answer:{" "}
              <span className={ans.is_correct ? "correct" : "wrong"}>
                {ans.answer_text || "No answer"}
              </span>
            </p>
            {ans.is_correct === false && ans.correct_answer && (
              <p>
                Correct answer:{" "}
                <span className="correct">{ans.correct_answer}</span>
              </p>
            )}
            {ans.is_correct === null && (
              <div className="theory-answer-block">
                ✏️ Your answer: {ans.answer_text}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ✅ Navigation */}
      <div style={{ marginTop: "1.5rem" }}>
        <button className="restart-btn" onClick={onRestart}>
          🔄 Restart Quiz
        </button>
        <Link to="/leaderboard" className="results-btn" style={{ marginLeft: "1rem" }}>
          🏆 View Leaderboard
        </Link>
        <Link to="/" className="results-btn" style={{ marginLeft: "1rem" }}>
          ⬅ Back to Home
        </Link>
      </div>
    </div>
  );
}

export default Results;
