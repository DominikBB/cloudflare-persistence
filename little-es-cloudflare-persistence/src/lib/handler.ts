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
        ).run();

        return { success: true, data: null }
      } catch (error) {
        return { success: false, at: "Persistance", error: error ? error.message : "Unknown persistance error." }
      }
    },

    getProjection: (projectionName: string) => async (id?: string) => {
      const searchOn = id ? id : projectionName;

      const getSnapshot = d1.prepare(`SELECT name, last_considered_event_id, version, snapshot FROM ${tables.projections} WHERE name = ?1 ORDER BY ID DESC LIMIT 1`)
      const getEventsFromSnapshot = d1.prepare(`
          WITH FilteredEntry AS (
            SELECT last_considered_event_id
            FROM ${tables.projections}
            WHERE name = ?1
            ORDER BY ID DESC
            LIMIT 1
        ), 

        LastProcessedId AS (
          SELECT ID
          FROM ${tables.events}
          WHERE event_id = (SELECT last_considered_event_id FROM FilteredEntry)
          LIMIT 1
        )

        SELECT *
        FROM ${tables.events}
        WHERE ID > IFNULL((SELECT ID FROM LastProcessedId), 0);
      `)

      try {
        const response = await d1.batch([
          getSnapshot.bind(searchOn),
          getEventsFromSnapshot.bind(searchOn)
        ]);

        const parseSnapshot = (response: any) => ({
          ...response,
          snapshot: response.snapshot ? JSON.parse(response.snapshot) : null
        })

        return {
          success: true,
          data: {
            id: searchOn,
            snapshot: response[0].results[0] !== undefined ? parseSnapshot(response[0].results[0]) : null,
            events: (response[1].results as { event: string }[]).map(e => JSON.parse(e.event)) as readonly LittleEsEvent<TEVENT>[]
          }
        } as unknown as EventStoreResult<PersistedProjection<TAGGREGATE, TEVENT>>
      } catch (error) {
        return { success: false, at: "Persistance", error: error ? error.message : "Unknown persistance error." } as EventStoreResult<PersistedProjection<TAGGREGATE, TEVENT>>
      }
    },

    get: async (subject: string) => {
      try {
        const result = await d1.prepare(`SELECT event FROM ${tables.events} WHERE subject = ?1 ORDER BY ID DESC`).bind(subject).run();

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        if (!result.success) return { success: false, at: "Persistance", error: result.error.message }

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        return { success: true, data: result.results.map(e => JSON.parse(e.event)) as unknown as readonly LittleEsEvent<TEVENT>[] }
      } catch (error) {
        return { success: false, at: "Persistance", error: error ? error.message : "Unknown persistance error." }
      }
    }
  }
};