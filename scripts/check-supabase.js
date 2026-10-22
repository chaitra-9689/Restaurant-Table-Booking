// Verifies the access token and project are reachable via the Management API.
require('dotenv').config();

const { SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF } = process.env;

(async () => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}`, {
    headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    console.error(`Supabase check failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const project = await res.json();
  console.log(`Connected: ${project.name} (${project.ref}) – ${project.status}`);
})();
