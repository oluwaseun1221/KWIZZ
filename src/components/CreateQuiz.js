// CreateQuiz.js
import React, { useState } from "react";
import { useAuth } from "@clerk/clerk-react"; // ✅ getToken lives on useAuth, not useUser

function CreateQuiz() {
  const { getToken } = useAuth(); // ✅ Use auth's getToken to fetch a session JWT

  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState({
    type: "mcq",
    question_text: "",
    options: ["", "", ""],
    correct: 0,
  });

  // ✅ Add question to list
  const addQuestion = () => {
    if (!newQuestion.question_text.trim()) return;
    const q = {
      id: questions.length + 1,
      type: newQuestion.type,
      question_text: newQuestion.question_text,
      answers:
        newQuestion.type === "mcq"
          ? newQuestion.options.map((opt, i) => ({
              id: `a${i + 1}`,
              answer_text: opt,
              is_correct: i === Number(newQuestion.correct),
            }))
          : [],
    };
    setQuestions([...questions, q]);
    setNewQuestion({
      type: "mcq",
      question_text: "",
      options: ["", "", ""],
      correct: 0,
    });
  };

  // ✅ Save quiz to backend
  const saveQuiz = async () => {
    if (!title.trim() || questions.length === 0) {
      alert("Please add a title and at least one question.");
      return;
    }

    try {
      const token = await getToken();

      const res = await fetch("http://127.0.0.1:8000/create_custom_quiz/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title, questions }),
      });

      if (!res.ok) {
        throw new Error("Failed to save quiz");
      }

      const data = await res.json();
      alert(`✅ Quiz saved! ID: ${data.quiz_id}`);
      setTitle("");
      setQuestions([]);
    } catch (error) {
      console.error("Error saving quiz:", error);
      alert("Failed to save quiz. Please ensure you are logged in.");
    }
  };

  return (
    <div className="create-quiz-container">
      <h2>Create Custom Quiz</h2>

      {/* Title */}
      <input
        type="text"
        placeholder="Quiz Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      {/* New Question Form */}
      <div className="new-question">
        <textarea
          placeholder="Enter your question"
          value={newQuestion.question_text}
          onChange={(e) =>
            setNewQuestion({ ...newQuestion, question_text: e.target.value })
          }
        />

        <select
          value={newQuestion.type}
          onChange={(e) => setNewQuestion({ ...newQuestion, type: e.target.value })}
        >
          <option value="mcq">Multiple Choice</option>
          <option value="theory">Theory</option>
        </select>

        {/* MCQ Options */}
        {newQuestion.type === "mcq" &&
          newQuestion.options.map((opt, i) => (
            <div key={i}>
              <input
                type="text"
                placeholder={`Option ${i + 1}`}
                value={opt}
                onChange={(e) => {
                  const opts = [...newQuestion.options];
                  opts[i] = e.target.value;
                  setNewQuestion({ ...newQuestion, options: opts });
                }}
              />
              <input
                type="radio"
                name="correct"
                checked={Number(newQuestion.correct) === i}
                onChange={() => setNewQuestion({ ...newQuestion, correct: i })}
              />
              Correct
            </div>
          ))}

        <button className="next-btn" onClick={addQuestion}>
          ➕ Add Question
        </button>
      </div>

      {/* Preview of questions */}
      <div className="preview">
        <h3>Preview</h3>
        {questions.map((q) => (
          <div key={q.id} className="result-item">
            <p>
              <strong>{q.type.toUpperCase()}:</strong> {q.question_text}
            </p>
            {q.type === "mcq" && (
              <ul>
                {q.answers.map((a) => (
                  <li key={a.id} className={a.is_correct ? "correct" : ""}>
                    {a.answer_text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Save button */}
      <button className="submit-btn" onClick={saveQuiz}>
        💾 Save Quiz
      </button>
    </div>
  );
}

export default CreateQuiz;