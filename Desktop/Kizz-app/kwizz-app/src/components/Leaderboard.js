// Leaderboard.js
import React, { useEffect, useState } from "react";

function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8000/get_leaderboard");
        if (!res.ok) throw new Error("Failed to fetch leaderboard");
        const data = await res.json();
        setLeaderboard(data.leaderboard || []);
      } catch (err) {
        console.error("Error loading leaderboard:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  return (
    <div className="leaderboard-container">
      <h2 className="leaderboard-title">🏆 Leaderboard</h2>

      {loading ? (
        <p className="leaderboard-status">Loading leaderboard...</p>
      ) : leaderboard.length > 0 ? (
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
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
        <p className="leaderboard-status">No scores yet. Be the first to play! 🎮</p>
      )}
    </div>
  );
}

export default Leaderboard;
