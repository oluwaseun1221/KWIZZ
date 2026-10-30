// Leaderboard.js
import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";

function Leaderboard() {
  const { getToken } = useAuth();
  const [view, setView] = useState("all"); // "all" | "mine"
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      setError("");
      try {
        let res;
        if (view === "mine") {
          const token = await getToken();
          res = await fetch("http://127.0.0.1:8000/my_scores", {
            headers: { Authorization: `Bearer ${token}` },
          });
        } else {
          res = await fetch("http://127.0.0.1:8000/get_leaderboard");
        }
        if (!res.ok) throw new Error("Failed to fetch leaderboard");
        const data = await res.json();
        setLeaderboard(data.leaderboard || []);
      } catch (err) {
        console.error("Error loading leaderboard:", err);
        setLeaderboard([]);
        setError(
          view === "mine"
            ? "Couldn't load your scores. Check that the backend is running and CLERK_JWKS_URL is set."
            : "Couldn't load the leaderboard. Is the backend running?"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [view, getToken]);

  const tabStyle = (active) => ({
    padding: "0.4rem 1rem",
    marginRight: "0.5rem",
    borderRadius: "999px",
    border: "1px solid #6366f1",
    background: active ? "#6366f1" : "transparent",
    color: active ? "#fff" : "inherit",
    cursor: "pointer",
  });

  return (
    <div className="leaderboard-container">
      <h2 className="leaderboard-title">🏆 Leaderboard</h2>

      <div style={{ marginBottom: "1rem" }}>
        <button style={tabStyle(view === "all")} onClick={() => setView("all")}>
          All players
        </button>
        <button style={tabStyle(view === "mine")} onClick={() => setView("mine")}>
          My scores
        </button>
      </div>

      {loading ? (
        <p className="leaderboard-status">Loading leaderboard...</p>
      ) : error ? (
        <p className="leaderboard-status">{error}</p>
      ) : leaderboard.length > 0 ? (
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>{view === "mine" ? "#" : "Rank"}</th>
              <th>Name</th>
              <th>Score</th>
              <th>Total</th>
              <th>%</th>
              <th>Difficulty</th>
              <th>Quiz ID</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry, idx) => (
              <tr key={idx}>
                <td>#{idx + 1}</td>
                <td>{entry.name}</td>
                <td>{entry.score}</td>
                <td>{entry.total}</td>
                <td>{entry.percentage}%</td>
                <td>{entry.difficulty}</td>
                <td>{entry.quiz_id}</td>
                <td>{new Date(entry.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="leaderboard-status">
          {view === "mine"
            ? "You have no saved scores yet. Take a quiz! 🎮"
            : "No scores yet. Be the first to play! 🎮"}
        </p>
      )}
    </div>
  );
}

export default Leaderboard;
