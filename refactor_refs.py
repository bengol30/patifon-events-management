import re

with open("app/page.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# Pattern 1 matches: obj.scope === "project" ? doc(db, "projects", obj.eventId, "tasks", obj.id) : doc(db, "events", obj.eventId, "tasks", obj.id);
pattern1 = re.compile(r'(\w+)\.scope === "project"\s*\?\s*doc\(db, "projects", \1\.eventId, "tasks", ([^\)]+)\)\s*:\s*doc\(db, "events", \1\.eventId, "tasks", \2\)')

replacement1 = r'(\1.scope === "general" ? doc(db, "tasks", \2) : (\1.scope === "project" ? doc(db, "projects", \1.eventId, "tasks", \2) : doc(db, "events", \1.eventId, "tasks", \2)))'
new_text = pattern1.sub(replacement1, text)

# Pattern 2 matches the bare variables
pattern2 = re.compile(r'scope === "project"\s*\?\s*doc\(db, "projects", eventId, "tasks", taskId\)\s*:\s*doc\(db, "events", eventId, "tasks", taskId\)')
replacement2 = r'(scope === "general" ? doc(db, "tasks", taskId) : (scope === "project" ? doc(db, "projects", eventId, "tasks", taskId) : doc(db, "events", eventId, "tasks", taskId)))'
new_text = pattern2.sub(replacement2, new_text)

with open("app/page.tsx", "w", encoding="utf-8") as f:
    f.write(new_text)

print("Replaced successfully!")
