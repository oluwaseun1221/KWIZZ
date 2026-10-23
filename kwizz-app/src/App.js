// App.js
import React, { useState } from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom";

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

// Centers Clerk's sign-in / sign-up card in the middle of the page
function CenteredAuth({ children }) {
  return <div className="clerk-center">{children}</div>;
}

function App() {
  const [score, setScore] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [quizId, setQuizId] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});
  const [, setQuestions] = useState([]);

  const handleQuizStart = () => {
    setScore(0);
    setTotalQuestions(0);
    setQuizId(null);
    setUserAnswers({});
    setQuestions([]);
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
        <Routes>
          <Route path="/" element={<Home onStartQuiz={handleQuizStart} />} /> {/* ✅ FIXED: Home is now accessible */}
          <Route
            path="/quiz"
            element={
              <Quiz
                setScore={setScore}
                setTotalQuestions={setTotalQuestions}
                setQuizId={setQuizId}
                setUserAnswers={setUserAnswers}
                setQuestions={setQuestions}
              />
            }
          />

          {/* Results is now a real route. If the page is refreshed there is no
              quiz in memory, so send the user home instead of showing a blank page. */}
          <Route
            path="/results"
            element={
              totalQuestions > 0 ? (
                <Results
                  score={score}
                  total={totalQuestions}
                  onRestart={handleQuizStart}
                  userAnswers={userAnswers}
                  quizId={quizId}
                />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />

          {/* Old /upload link: uploading now happens on the quiz page */}
          <Route path="/upload" element={<Navigate to="/quiz" replace />} />

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
            element={<CenteredAuth><SignIn routing="path" path="/sign-in" /></CenteredAuth>}
          />
          <Route
            path="/sign-up"
            element={<CenteredAuth><SignUp routing="path" path="/sign-up" /></CenteredAuth>}
          />
          <Route
            path="/sign-in/sso-callback"
            element={<CenteredAuth><SignIn routing="path" path="/sign-in" /></CenteredAuth>}
          />
          <Route
            path="/sign-up/sso-callback"
            element={<CenteredAuth><SignUp routing="path" path="/sign-up" /></CenteredAuth>}
          />
        </Routes>
      </SignedOut>
    </div>
  );
}

export default App;