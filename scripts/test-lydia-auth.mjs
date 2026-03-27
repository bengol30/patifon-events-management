import { listLydiaLeads, getLydiaLeadById } from '../lib/lydia.ts';

async function main() {
  const leads = await listLydiaLeads(5);
  console.log(`Fetched ${leads.length} leads`);

  if (leads.length === 0) {
    throw new Error('No leads returned from Lydia');
  }

  const first = leads[0];
  console.log('First lead:', {
    id: first.id,
    name: first.name,
    company: first.company,
    created_at: first.created_at,
  });

  const sameLead = await getLydiaLeadById(first.id);
  if (!sameLead) {
    throw new Error('getLydiaLeadById returned null for known lead');
  }

  console.log('Lookup by ID ok:', sameLead.id);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
