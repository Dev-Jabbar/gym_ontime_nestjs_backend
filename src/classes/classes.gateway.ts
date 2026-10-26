import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Namespace } from "socket.io";
import { Subscription, bufferTime, filter, map } from "rxjs";
import { ALLOWED_ORIGINS } from "../common/cors.js";
import { ClassEvents } from "./class-events.service.js";
import { ClassesRepository } from "./classes.repository.js";

export interface ClassCapacityPayload {
  classId: string;
  enrolled: number;
  capacity: number;
}

// Live seat counts. Public on purpose: GET /api/classes is already public and
// shows the same numbers, so the socket needs no authentication. It only ever
// sends server to browser; nothing a client sends is acted on.
@Injectable()
@WebSocketGateway({
  namespace: "/classes",
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
})
export class ClassesGateway
  implements
    OnModuleInit,
    OnModuleDestroy,
    OnGatewayConnection,
    OnGatewayDisconnect
{
  private readonly logger = new Logger(ClassesGateway.name);
  private sub?: Subscription;

  @WebSocketServer()
  // With a `namespace` option Nest injects the Namespace, not the root
  // Server. A Namespace keeps its connected sockets in `sockets` (a Map).
  server!: Namespace;

  constructor(
    private readonly events: ClassEvents,
    private readonly classesRepo: ClassesRepository,
  ) {}

  onModuleInit() {
    // Collect ids for 300ms, then de-duplicate: a burst of changes to the same
    // class (for example a webhook retry) becomes one database read and one
    // broadcast.
    this.sub = this.events.changes$
      .pipe(
        bufferTime(300),
        filter((ids) => ids.length > 0),
        map((ids) => [...new Set(ids)]),
      )
      .subscribe((ids) => {
        for (const id of ids) void this.broadcast(id);
      });
  }

  onModuleDestroy() {
    this.sub?.unsubscribe();
  }

  handleConnection() {
    this.logger.debug(`client connected (${this.server.sockets.size} total)`);
  }

  handleDisconnect() {
    this.logger.debug(
      `client disconnected (${this.server.sockets.size} total)`,
    );
  }

  // Reads the numbers straight from Postgres, never the cache, so a broadcast
  // is always at least as fresh as GET /classes.
  private async broadcast(classId: string) {
    try {
      const row = await this.classesRepo.findByIdWithMemberCount(classId);
      if (!row) {
        this.server.emit("class:removed", { classId });
        return;
      }
      const payload: ClassCapacityPayload = {
        classId,
        enrolled: row._count.members,
        capacity: row.capacity ?? 0,
      };
      this.server.emit("class:capacity", payload);
      this.logger.log(
        `class:capacity ${classId} ${payload.enrolled}/${payload.capacity}`,
      );
    } catch (err) {
      // A failed broadcast must never affect the booking that triggered it.
      this.logger.warn(
        `broadcast failed for ${classId}: ${(err as Error).message}`,
      );
    }
  }
}
