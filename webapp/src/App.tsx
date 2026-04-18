import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { GamePage } from "@/pages/GamePage";
import { LobbyPage } from "@/pages/LobbyPage";
import { socketService } from "@/services/socketService";
import { useGameStore } from "@/stores/gameStore";

export const App = () => {
  const applyServerEvent = useGameStore((state) => state.applyServerEvent);

  useEffect(() => {
    const accessToken = localStorage.getItem("qrs.accessToken");
    if (accessToken) {
      socketService.connect(accessToken);
    }

    return socketService.subscribe(applyServerEvent);
  }, [applyServerEvent]);

  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/game" element={<GamePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
