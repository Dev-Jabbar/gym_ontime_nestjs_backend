import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

// Tiny in-process event bus. ClassesRepository calls classChanged() right
// after a write commits (next to the cache invalidation); ClassesGateway
// subscribes and pushes the fresh numbers to connected browsers. Keeping
// the bus separate means the repository never imports the gateway, and the
// gateway can use the repository without a circular dependency.
@Injectable()
export class ClassEvents {
  private readonly subject = new Subject<string>();

  readonly changes$ = this.subject.asObservable();

  classChanged(classId: string) {
    this.subject.next(classId);
  }
}
