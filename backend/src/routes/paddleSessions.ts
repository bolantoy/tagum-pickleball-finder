import { Router, type RequestHandler } from "express";
import { createSupabasePaddleQRepository } from "../paddleQ/supabasePaddleQRepository";
import { PaddleQService } from "../paddleQ/paddleQService";
import { createPaddleQController } from "../paddleQ/paddleQController";

type Controller = ReturnType<typeof createPaddleQController>;

/** Dependency-injected router factory for API tests; default composition uses the backend service-role repository. */
export function createPaddleSessionsRouter(service?: PaddleQService): Router {
  const router = Router();
  let controller: Controller | undefined;
  const getController = (): Controller => {
    if (!controller) controller = createPaddleQController(service ?? new PaddleQService(createSupabasePaddleQRepository()));
    return controller;
  };
  const route = (name: keyof Controller): RequestHandler => (req, res, next) => {
    const handler = getController()[name];
    return handler(req, res);
  };

  router.post("/", route("createSession"));
  router.get("/:sessionId", route("getSession"));
  router.patch("/:sessionId", route("updateSession"));
  router.post("/:sessionId/organizer-capability/rotate", route("rotateCapability"));
  router.post("/:sessionId/organizer-capability/revoke", route("revokeCapability"));

  router.post("/:sessionId/players", route("addPlayer"));
  router.post("/:sessionId/players/manage", route("addManagedPlayer"));
  router.post("/:sessionId/players/:playerId/rejoin", route("rejoinPlayer"));
  router.post("/:sessionId/players/:playerId/pause", route("pausePlayer"));
  router.post("/:sessionId/players/:playerId/remove", route("removePlayer"));
  router.get("/:sessionId/queue", route("getQueue"));
  router.patch("/:sessionId/queue/:playerId", route("movePlayer"));
  router.post("/:sessionId/queue/:playerId/skip", route("skipPlayer"));

  router.post("/:sessionId/rotation/recommendation", route("recommend"));
  router.get("/:sessionId/games/current", route("getCurrentGames"));
  router.get("/:sessionId/games", route("getGameHistory"));
  router.post("/:sessionId/games", route("startForcedGames"));
  router.post("/:sessionId/games/recommended", route("startRecommended"));
  router.post("/:sessionId/games/:gameId/complete", route("completeGame"));
  router.post("/:sessionId/games/:gameId/cancel", route("cancelGame"));

  router.get("/:sessionId/statistics", route("getStatistics"));
  router.get("/:sessionId/players/:playerId/statistics", route("getPlayerStatistics"));
  return router;
}

export default createPaddleSessionsRouter();
