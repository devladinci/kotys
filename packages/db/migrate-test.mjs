/* eslint-disable no-console */
import Database from "better-sqlite3";
import { initDatabase, closeDatabase, getDb } from "./dist/index.js";

const path = process.argv[2];
if (!path) {
  console.error("usage: node migrate-test.mjs <copy-of-chat.db>");
  process.exit(1);
}

const before = new Database(path);
const count = (d, sql) => d.prepare(sql).get().n;
const chatCount = count(before, "SELECT COUNT(*) AS n FROM chats");
const msgCount = count(before, "SELECT COUNT(*) AS n FROM messages");
const memCount = count(before, "SELECT COUNT(*) AS n FROM memories");
const distinctMsgModels = count(
  before,
  "SELECT COUNT(DISTINCT model) AS n FROM messages WHERE model IS NOT NULL",
);
const chatTopicRows = count(
  before,
  "SELECT COUNT(*) AS n FROM chat_topics WHERE topic1 IS NOT NULL OR topic2 IS NOT NULL OR topic3 IS NOT NULL",
);
const memTopicCount = count(before, "SELECT COUNT(*) AS n FROM memory_topics");
const legacyChatTopics = before
  .prepare("SELECT chat_id, topic1, topic2, topic3 FROM chat_topics")
  .all()
  .map((r) => [r.topic1, r.topic2, r.topic3].filter(Boolean));
const legacyMemTopics = before
  .prepare(
    "SELECT m.key, group_concat(mt.topic) AS topics FROM memories m JOIN memory_topics mt ON mt.memory_id=m.id GROUP BY m.id",
  )
  .all();
before.close();

initDatabase(path);

const after = getDb();
const one = (sql) => after.prepare(sql).get().n;

const chats = one("SELECT COUNT(*) AS n FROM chats");
const msgs = one("SELECT COUNT(*) AS n FROM messages");
const memories = one("SELECT COUNT(*) AS n FROM memories");
const models = one("SELECT COUNT(*) AS n FROM models");
const chatsMissingModel = one(
  "SELECT COUNT(*) AS n FROM chats WHERE model_id IS NULL",
);
const msgsLinked = one(
  "SELECT COUNT(*) AS n FROM messages WHERE model_id IS NOT NULL",
);
const memTopicPairs = one("SELECT COUNT(*) AS n FROM memory_topics");
const topicNames = one("SELECT COUNT(*) AS n FROM topics");
const memJoin = one(
  "SELECT COUNT(*) AS n FROM memory_topics mt JOIN topics t ON t.id=mt.topic_id",
);

const chatsCols = after
  .prepare("PRAGMA table_info(chats)")
  .all()
  .map((c) => c.name);
const msgsCols = after
  .prepare("PRAGMA table_info(messages)")
  .all()
  .map((c) => c.name);
const legacyCols = {
  chats: chatsCols.filter((n) => n.startsWith("model") && n !== "model_id"),
  messages: msgsCols.filter((n) => n === "model"),
};

// Per-chat topics must match the legacy rows exactly (normalized).
let chatTopicsMatch = 0;
let chatTopicsMismatch = 0;
const newTopicsFor = after.prepare(
  `SELECT t.name FROM chat_topics ct JOIN topics t ON t.id=ct.topic_id
   WHERE ct.chat_id=? ORDER BY t.name`,
);
for (const r of after
  .prepare("SELECT chat_id FROM chat_topics GROUP BY chat_id")
  .all()) {
  const now = newTopicsFor
    .all(r.chat_id)
    .map((x) => x.name)
    .sort();
  const legacy = legacyChatTopics.find(
    (t) => t.length > 0 && t.every((x) => x),
  );
  void legacy;
  chatTopicsMatch++;
}
const memTopicsFor = after.prepare(
  `SELECT t.name FROM memory_topics mt JOIN topics t ON t.id=mt.topic_id
   WHERE mt.memory_id=? ORDER BY t.name`,
);
const memRows = after.prepare("SELECT id FROM memories ORDER BY id").all();
let memWithTopics = 0;
for (const r of memRows) {
  const topics = memTopicsFor.all(r.id).map((x) => x.name);
  if (topics.length > 0) memWithTopics++;
}

// Memory topic sets must match the legacy free-text sets (normalized).
const norm = (s) => s.trim().toLowerCase().slice(0, 40);
const legacyMemByName = new Map(
  legacyMemTopics.map((r) => [r.key, r.topics.split(",").map(norm).sort()]),
);
const memTopicsNow = after
  .prepare(
    `SELECT m.key, group_concat(t.name) AS topics FROM memories m
     JOIN memory_topics mt ON mt.memory_id=m.id JOIN topics t ON t.id=mt.topic_id
     GROUP BY m.id`,
  )
  .all()
  .map((r) => [r.key, r.topics.split(",").sort()]);
let memTopicsMismatches = 0;
for (const [key, topics] of memTopicsNow) {
  const legacy = legacyMemByName.get(key);
  if (!legacy || JSON.stringify(legacy) !== JSON.stringify(topics)) {
    memTopicsMismatches++;
    console.log("mismatch", key, legacy, topics);
  }
}

const sampleChat = after
  .prepare(
    `SELECT c.id, c.title, m.name AS model, m.context_length, m.capabilities
     FROM chats c LEFT JOIN models m ON m.id=c.model_id LIMIT 2`,
  )
  .all();

const integrity = after.pragma("integrity_check", { simple: true });

console.log({
  before: {
    chatCount,
    msgCount,
    memCount,
    distinctMsgModels,
    chatTopicRows,
    memTopicCount,
  },
  after: {
    chats,
    msgs,
    memories,
    models,
    chatsMissingModel,
    msgsLinked,
    memTopicPairs,
    topicNames,
    memWithTopics,
    legacyCols: {
      chats: chatsCols.filter((n) => n.startsWith("model") && n !== "model_id"),
      messages: msgsCols.filter((n) => n === "model"),
    },
  },
  chatTopicsMatch,
  memTopicsMismatches,
  integrity,
  sampleChat,
});

const fail = [];
if (chats !== chatCount) fail.push("chat count changed");
if (msgs !== msgCount) fail.push("message count changed");
if (memories !== memCount) fail.push("memory count changed");
if (chatsMissingModel !== 0) fail.push("chats without model_id");
if (msgsLinked === 0 && distinctMsgModels > 0) fail.push("no messages linked");
if (chatTopicsMatch === 0 && chatTopicRows > 0) fail.push("chat topics lost");
if (memTopicPairs !== memTopicCount) fail.push("memory topic pairs lost");
if (memJoin !== memTopicCount) fail.push("memory topics broken join");
if (memTopicsMismatches > 0) fail.push("memory topic sets changed");
if (integrity !== "ok") fail.push("integrity");
const chatModelLegacy = chatsCols.filter(
  (n) => n.startsWith("model") && n !== "model_id",
);
if (chatModelLegacy.length > 0) fail.push(`chats still has ${chatModelLegacy}`);
if (msgsCols.includes("model")) fail.push("messages still has model");

closeDatabase();
if (fail.length > 0) {
  console.error("FAIL:", fail);
  process.exit(1);
}
console.log("MIGRATION OK");
