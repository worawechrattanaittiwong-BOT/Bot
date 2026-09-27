import { Injectable } from "@nestjs/common";
import { Observable, Subject, filter, map, merge, of } from "rxjs";

export type RuntimeRealtimeEvent = {
  eventId: string;
  eventType: string;
  instanceId: string;
  slotId: string;
  occurredAt: number;
  receivedAt: number;
  state?: string | null;
  positions?: number | null;
  symbol?: string | null;
  sourceAgeMs?: number | null;
};

@Injectable()
export class RuntimeEventService {
  private readonly userChannels = new Map<string, Subject<RuntimeRealtimeEvent>>();

  private channel(userId: string) {
    let channel = this.userChannels.get(userId);
    if (!channel) {
      channel = new Subject<RuntimeRealtimeEvent>();
      this.userChannels.set(userId, channel);
    }
    return channel;
  }

  publish(userId: string, event: RuntimeRealtimeEvent) {
    this.channel(userId).next(event);
  }

  stream(userId: string, slotId = ""): Observable<any> {
    const live = this.channel(userId).asObservable().pipe(
      filter(event => !slotId || event.slotId === slotId),
      map(event => ({
        type: "runtime",
        id: event.eventId,
        data: event
      }))
    );

    return merge(
      of({
        type: "connected",
        data: {
          slotId: slotId || null,
          connectedAt: Date.now()
        }
      }),
      live
    );
  }
}
