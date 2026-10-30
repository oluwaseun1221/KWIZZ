import React, { useState } from "react";
import { Link } from "react-router-dom";

function Home({ onStartQuiz }) {
  const [difficulty, setDifficulty] = useState("easy");

  const handleStart = () => {
    // Save difficulty so Quiz.js & Results.js can use it
    localStorage.setItem("quizDifficulty", difficulty);
    onStartQuiz();
  };

  return (
    <div className="home-container">
      {/* Welcome Section */}
      <h2>Welcome to Kwizz 🎉</h2>
      <p className="home-tagline">
        Learn smarter, play harder, and climb the leaderboard with AI-powered
        quizzes.
      </p>

      {/* ✅ Difficulty Selector */}
      <div className="difficulty-selector">
        <label>
          Difficulty:
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            style={{ marginLeft: "10px" }}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
      </div>

      {/* Actions */}
      <div className="home-actions">
        {/* Start quiz */}
        <Link to="/quiz" className="start-btn" onClick={handleStart}>
          ▶ Start Quiz
        </Link>

        {/* Create quiz */}
        <Link to="/create-quiz" className="create-btn">
          ✍️ Create Quiz
        </Link>
        
        {/* Leaderboard */}
        <Link to="/leaderboard" className="leaderboard-btn">
          🏆 Leaderboard
        </Link>
      </div>

      {/* Features */}
      <div className="home-features">
        <h3>Why Kwizz?</h3>
        <ul>
          <li>📁 Upload PDF, Word, or text files to auto-generate quizzes</li>
          <li>🤖 AI-powered question & hint generation</li>
          <li>⏳ Timed quizzes with multiple difficulty levels</li>
          <li>🏆 Track your progress with leaderboard & high scores</li>
          <li>✍️ Create and share your own quizzes</li>
        </ul>
      </div>

      {/* Footer */}
      <footer className="home-footer">
        <p>🚀 Powered by AI & Clerk Authentication</p>
      </footer>
    </div>
  );
}

export default Home;