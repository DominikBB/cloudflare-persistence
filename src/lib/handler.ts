import { D1Database } from "@cloudflare/workers-types";
import { BaseEvent, EventStoreResult, LittleEsEvent, PersistanceHandler, PersistedProjection, Snapshot } from "little-es";

const tables = {
  events: "events",
  projections: "projections"
}

export const createPersistenceHandler = <TAGGREGATE, TEVENT extends BaseEvent>(d1: D1Database): PersistanceHandler<TAGGREGATE, TEVENT> => {
  return {
    save: async (events) => {

      if (events.length === 0) return { success: true, data: null }
      if (events.length > 50) return { success: false, at: "Persistance", error: "Batch size too large. Max 50 events can be persisted at a time." }

      const insertIntoDb = d1.prepare(`INSERT INTO ${tables.events} (subject, subject_sequence_id, event_id, source, time, event) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)

      try {
        await d1.batch(events.map(event =>
          insertIntoDb.bind(
            event.subject,
            event.id.split("_")[0] ? event.id.split("_")[0] : "1",
            event.id,
            event.source,
            new Date(event.time).valueOf(),
            JSON.stringify(event)
          )));

        return { success: true, data: null }
      } catch (error) {
        return { success: false, at: "Persistance", error: error ? error.message : "Unknown persistance error." }
      }
    },

    snapshot: async (snapshot: Snapshot<TAGGREGATE>) => {
      const insertIntoDb = d1.prepare(`INSERT INTO ${tables.projections} (name, last_considered_event_id, version, snapshot) VALUES (?1, ?2, ?3, ?4)`)

      try {
        await insertIntoDb.bind(
          snapshot.name,
          snapshot.lastConsideredEvent,
          snapshot.schemaVersion,
          JSON.stringify(snapshot.state)
        );

        return { success: true, data: null }
      } catch (error) {
        return { success: false, at: "Persistance", error: error ? error.message : "Unknown persistance error." }
      }
    },

    getProjection: (projectionName: string) => async (id?: string) => {
      const searchOn = id ? id : projectionName;

      const getSnapshot = d1.prepare(`SELECT name, last_considered_event_id, version, snapshot FROM ${tables.projections} WHERE name = ?1 ORDER BY ID DESC LIMIT 1`)
      const getEventsFromSnapshot = d1.prepare(`
        WITH latest_projection AS (
            SELECT *
            FROM ${tables.projections}
            WHERE name = '${searchOn}'
            ORDER BY ID DESC
            LIMIT 1
        )

        SELECT e.*
        FROM ${tables.events} e
        LEFT JOIN latest_projection lp ON e.event_id = lp.last_considered_event_id
        WHERE e.ID > lp.ID;
      `)

      try {
        const response = await d1.batch([
          getSnapshot.bind(searchOn),
          getEventsFromSnapshot.bind(searchOn)
        ]);

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        return { success: true, data: { id: searchOn, snapshot: response[0].results, events: response[1].results.map(e => e.event) } } as EventStoreResult<PersistedProjection<TAGGREGATE, TEVENT>>
      } catch (error) {
        return { success: false, at: "Persistance", error: error ? error.message : "Unknown persistance error." } as EventStoreResult<PersistedProjection<TAGGREGATE, TEVENT>>
      }
    },

    get: async (subject: string) => {
      try {
        const result = await d1.prepare(`SELECT event FROM ${tables.events} WHERE subject = ?1 ORDER BY ID DESC`).bind(subject).run();

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        return { success: true, data: result.result.map(e => e.event) as unknown as readonly LittleEsEvent<TEVENT>[] }
      } catch (error) {
        return { success: false, at: "Persistance", error: error ? error.message : "Unknown persistance error." }
      }
    }
  }
};