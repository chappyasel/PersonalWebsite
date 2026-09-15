import { UNIT_COUNT } from "../data";
import { useRoomNavigation } from "../input/RoomNavigation";
import { openSearchFromEdge } from "../mobile/roomEdgeMotion";
import { useStacks } from "../store";
import { useCallback } from "react";

import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";

export function useSheetNavigation() {
  const navigate = useRoomNavigation();
  return useCallback(
    (direction: -1 | 1) => {
      const state = useStacks.getState();
      if (
        state.modalOpen ||
        state.dragging ||
        state.visionRidePhase !== "idle" ||
        isUniversalSearchOpen()
      )
        return false;
      const target = state.activeUnit + direction;
      if (target === -1) {
        openSearchFromEdge();
        return true;
      }
      return target >= 0 && target < UNIT_COUNT ? navigate(target) : false;
    },
    [navigate],
  );
}
