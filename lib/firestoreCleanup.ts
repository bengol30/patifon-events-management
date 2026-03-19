import { collection, deleteDoc, doc, getDocs, query, where, type Firestore } from "firebase/firestore";
import { deleteObject, ref, type FirebaseStorage } from "firebase/storage";

const collectStoragePath = (bucket: Set<string>, value?: string | null) => {
  if (value && typeof value === "string") bucket.add(value);
};

const deleteDocSafe = async (target: any, label: string) => {
  try {
    await deleteDoc(target);
  } catch (err) {
    console.error(`Failed deleting ${label}`, err);
  }
};

const deleteStoragePaths = async (storage: FirebaseStorage | null | undefined, paths: Iterable<string>) => {
  if (!storage) return;
  await Promise.all(
    Array.from(paths).map((path) => deleteObject(ref(storage, path)).catch((err) => console.error("Failed deleting storage file", path, err)))
  );
};

const cleanupTaskDocs = async (db: Firestore, parentType: "events" | "projects", parentId: string, storagePaths: Set<string>) => {
  const tasksSnap = await getDocs(collection(db, parentType, parentId, "tasks"));
  for (const taskDoc of tasksSnap.docs) {
    try {
      const [filesSnap, messagesSnap] = await Promise.all([
        getDocs(collection(db, parentType, parentId, "tasks", taskDoc.id, "files")),
        getDocs(collection(db, parentType, parentId, "tasks", taskDoc.id, "messages")),
      ]);

      await Promise.all(filesSnap.docs.map(async (fileDoc) => {
        const data = fileDoc.data() as any;
        collectStoragePath(storagePaths, data.storagePath);
        await deleteDocSafe(fileDoc.ref, `task file ${parentType}/${parentId}/${taskDoc.id}/${fileDoc.id}`);
      }));
      await Promise.all(messagesSnap.docs.map((messageDoc) => deleteDocSafe(messageDoc.ref, `task message ${parentType}/${parentId}/${taskDoc.id}/${messageDoc.id}`)));
    } catch (err) {
      console.error(`Failed cleaning task subcollections for ${parentType}/${parentId}/${taskDoc.id}`, err);
    }

    await deleteDocSafe(taskDoc.ref, `task ${parentType}/${parentId}/${taskDoc.id}`);
  }
};

const cleanupDirectSubcollection = async (db: Firestore, path: ["events" | "projects", string, string], storagePaths?: Set<string>) => {
  const [parentType, parentId, subcollection] = path;
  try {
    const snap = await getDocs(collection(db, parentType, parentId, subcollection));
    await Promise.all(snap.docs.map(async (docSnap) => {
      const data = docSnap.data() as any;
      if (storagePaths) collectStoragePath(storagePaths, data.storagePath);
      await deleteDocSafe(docSnap.ref, `${subcollection} ${parentType}/${parentId}/${docSnap.id}`);
    }));
  } catch (err) {
    console.error(`Failed cleaning ${subcollection} for ${parentType}/${parentId}`, err);
  }
};

export const deleteEventCascade = async (db: Firestore, eventId: string, storage?: FirebaseStorage | null) => {
  const storagePaths = new Set<string>();

  await cleanupDirectSubcollection(db, ["events", eventId, "files"], storagePaths);
  await cleanupDirectSubcollection(db, ["events", eventId, "volunteers"]);
  await cleanupDirectSubcollection(db, ["events", eventId, "attendees"]);
  await cleanupDirectSubcollection(db, ["events", eventId, "registrants"]);
  await cleanupDirectSubcollection(db, ["events", eventId, "budgetItems"]);
  await cleanupTaskDocs(db, "events", eventId, storagePaths);

  try {
    const joinReqSnap = await getDocs(query(collection(db, "join_requests"), where("eventId", "==", eventId)));
    await Promise.all(joinReqSnap.docs.map((d) => deleteDocSafe(d.ref, `join request ${d.id}`)));
  } catch (err) {
    console.error("Failed cleaning join requests", err);
  }

  try {
    const completionsSnap = await getDocs(query(collection(db, "volunteer_completions"), where("eventId", "==", eventId)));
    await Promise.all(completionsSnap.docs.map((d) => deleteDocSafe(d.ref, `volunteer completion ${d.id}`)));
  } catch (err) {
    console.error("Failed cleaning volunteer completions for event", err);
  }

  await deleteStoragePaths(storage, storagePaths);
  await deleteDoc(doc(db, "events", eventId));
};

export const deleteProjectCascade = async (db: Firestore, projectId: string, storage?: FirebaseStorage | null) => {
  const storagePaths = new Set<string>();

  await cleanupDirectSubcollection(db, ["projects", projectId, "volunteers"]);
  await cleanupTaskDocs(db, "projects", projectId, storagePaths);

  try {
    const completionsSnap = await getDocs(
      query(collection(db, "volunteer_completions"), where("eventId", "==", projectId), where("scope", "==", "project"))
    );
    await Promise.all(completionsSnap.docs.map((d) => deleteDocSafe(d.ref, `project volunteer completion ${d.id}`)));
  } catch (err) {
    console.error("Failed cleaning volunteer completions for project", err);
  }

  await deleteStoragePaths(storage, storagePaths);
  await deleteDoc(doc(db, "projects", projectId));
};
