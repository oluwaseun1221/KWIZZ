// App.js
import React, { useState } from "react";
import { Routes, Route, Link } from "react-router-dom";

// ✅ Clerk imports
import {
  SignedIn,
  SignedOut,
  SignIn,
  SignUp,
  UserButton,
} from "@clerk/clerk-react";

// ✅ Components
import Home from "./components/Home";
import Quiz from "./components/Quiz";
import Results from "./components/Results";
import Leaderboard from "./components/Leaderboard";
import CreateQuiz from "./components/CreateQuiz";
import UploadFile from "./components/UploadFile";

function App() {
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [quizId, setQuizId] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});
  const [questions, setQuestions] = useState([]);

  const handleQuizStart = () => {
    setQuizFinished(false);
    setScore(0);
    setTotalQuestions(0);
    setQuizId(null);
    setUserAnswers({});
    setQuestions([]);
  };

  const handleQuizFinish = () => {
    setQuizFinished(true);
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>Kwizz</h1>
        <SignedIn>
          <UserButton afterSignOutUrl="/" />
        </SignedIn>
      </header>

      {/* ✅ If signed in → show app routes */}
      <SignedIn>
        {quizFinished && (
          <div className="quiz-results">
            <Results
              score={score}
              total={totalQuestions}
              onRestart={handleQuizStart}
              userAnswers={userAnswers}
              quizId={quizId}
            />
          </div>
        )}

        <Routes>
          <Route path="/" element={<Home onStartQuiz={handleQuizStart} />} /> {/* ✅ FIXED: Home is now accessible */}
          <Route
            path="/quiz"
            element={
              <Quiz
                onFinish={handleQuizFinish}
                setScore={setScore}
                setTotalQuestions={setTotalQuestions}
                setQuizId={setQuizId}
                setUserAnswers={setUserAnswers}
                setQuestions={setQuestions}
              />
            }
          />

          <Route
            path="/upload"
            element={<UploadFile />}
          />

          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/create-quiz" element={<CreateQuiz />} />
        </Routes>
      </SignedIn>

      {/* ✅ If signed out → show sign-in / sign-up */ }
      <SignedOut>
        <Routes>
          <Route
            path="/"
            element={
              <div className="auth-container">
                <h2>Welcome to Kwizz App 🎉</h2>
                <p>Ready to test your knowledge with AI-powered quizzes?</p>

                <div className="auth-buttons">
                  <Link to="/sign-in" className="auth-btn">
                    Sign In
                  </Link>
                  <Link to="/sign-up" className="auth-btn">
                    Sign Up
                  </Link>
                </div>
              </div>
            }
          />

          {/* Clerk Auth routes */}
          <Route
            path="/sign-in"
            element={<SignIn routing="path" path="/sign-in" />}
          />
          <Route
            path="/sign-up"
            element={<SignUp routing="path" path="/sign-up" />}
          />
          <Route
            path="/sign-in/sso-callback"
            element={<SignIn routing="path" path="/sign-in" />}
          />
          <Route
            path="/sign-up/sso-callback"
            element={<SignUp routing="path" path="/sign-up" />}
          />
        </Routes>
      </SignedOut>
    </div>
  );
}

export default App;