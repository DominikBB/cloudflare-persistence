import { expect, it } from "vitest";
import { createPersistenceHandler } from "../src/index";
import { env } from "cloudflare:test";
import { LittleEsEvent } from "little-es";

it("should create and retrieve events for the correct subject", async () => {
  const eventsPerBatch = 3;
  const sut = createPersistenceHandler(env.DATABASE);

  const firstIdEvents = createEventsForId("id1", eventsPerBatch);
  const secondIdEvents = createEventsForId("id2", eventsPerBatch);

  const results = await Promise.all([
    sut.save(firstIdEvents),
    sut.save(secondIdEvents)
  ]);

  expect(results.some(r => !r.success)).toBeFalsy();

  const firstIdEventsRetrieved = await sut.get("id1");

  expect(firstIdEventsRetrieved.success).toBeTruthy();

  firstIdEventsRetrieved.success && expect(firstIdEventsRetrieved.data.length).toBe(eventsPerBatch);
  firstIdEventsRetrieved.success && expect(firstIdEventsRetrieved.data.some(e => e.subject === "id1")).toBeTruthy();
});

it("should create snapshots and retrieve projection data correctly", async () => {
  const eventsPerBatch = 6;
  const sut = createPersistenceHandler(env.DATABASE);

  const firstIdEvents = createEventsForId("id1", eventsPerBatch);
  const secondIdEvents = createEventsForId("id2", eventsPerBatch);

  const results = await Promise.all([
    sut.save(firstIdEvents),
    sut.save(secondIdEvents)
  ]);

  expect(results.some(r => !r.success)).toBeFalsy();

  const firstIdEventsRetrieved = await sut.snapshot({
    name: "fooOrBar",
    lastConsideredEvent: "3_id1",
    schemaVersion: 1,
    state: "foo"
  });

  expect(firstIdEventsRetrieved.success).toBeTruthy();

  const projection = await sut.getProjection("fooOrBar")();
  // console.log(await env.DATABASE.prepare("SELECT * FROM events WHERE event_id = '3_id2'").all());
  // console.log(await env.DATABASE.prepare("SELECT * FROM projections").all());
  expect(projection.success).toBeTruthy();

  //@ts-ignore
  projection.success && expect(projection.data.snapshot.snapshot).toBe("foo");
  projection.success && expect(projection.data.events.length).toBe(9);

});

it("should retrieve all events if projection has no snapshot", async () => {
  const eventsPerBatch = 3;
  const sut = createPersistenceHandler(env.DATABASE);

  const firstIdEvents = createEventsForId("id1", eventsPerBatch);
  const secondIdEvents = createEventsForId("id2", eventsPerBatch);

  const results = await Promise.all([
    sut.save(firstIdEvents),
    sut.save(secondIdEvents)
  ]);

  expect(results.some(r => !r.success)).toBeFalsy();

  const projection = await sut.getProjection("fooOrBar")();
  // console.log(await env.DATABASE.prepare("SELECT * FROM events WHERE event_id = '3_id2'").all());
  // console.log(await env.DATABASE.prepare("SELECT * FROM projections").all());
  expect(projection.success).toBeTruthy();

  //@ts-ignore
  projection.success && expect(projection.data.events.length).toBe(6);

});

it("should retrieve all events if projection has no snapshot", async () => {
  const eventsPerBatch = 3;
  const sut = createPersistenceHandler(env.DATABASE);

  const firstIdEvents = createEventsForId("id1", eventsPerBatch);
  const secondIdEvents = createEventsForId("id2", eventsPerBatch);

  const results = await Promise.all([
    sut.save(firstIdEvents),
    sut.save(secondIdEvents)
  ]);

  expect(results.some(r => !r.success)).toBeFalsy();

  const projection = await sut.getProjection("fooOrBar")("3_id1");
  // console.log(await env.DATABASE.prepare("SELECT * FROM events WHERE event_id = '3_id2'").all());
  // console.log(await env.DATABASE.prepare("SELECT * FROM projections").all());
  expect(projection.success).toBeTruthy();

  //@ts-ignore
  projection.success && expect(projection.data.id).toBe("3_id1");
  projection.success && expect(projection.data.events.length).toBe(6);

});

type TestingCloudEvent = LittleEsEvent<{ type: "bla" | "blu", data: string }>

function* generateRandomEvent(subject: string): Generator<TestingCloudEvent> {
  let i = 1;
  while (true) {
    const event: TestingCloudEvent = {
      type: Math.random() > 0.5 ? "bla" : "blu",
      id: i.toString() + "_" + subject,
      data: Math.random() > 0.5 ? "foo" : "bar",
      specversion: "1.0",
      time: new Date().toISOString(),
      datacontenttype: "json",
      subject: subject,
      source: "eventSource",
      littleEs: {
        littleEsVersion: 1,
        is: "PrivateEvent"
      }
    };
    i = i + 1;
    yield event;
  }
}

const createEventsForId = (id: string, numberOfEvents: number) => {
  const secondIdEventsGenerator = generateRandomEvent(id);
  return Array.from({ length: numberOfEvents }, () => secondIdEventsGenerator.next().value);
}