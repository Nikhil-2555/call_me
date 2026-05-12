fetch('http://localhost:8000/call/outbound', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent_id: '96630311-60a1-419b-80a8-48c87d6c3964',
    agent_phone_number_id: '937303b3-4257-4a6a-aa16-9b7c7ac0e1d8',
    to_number: '+916356354400'
  })
}).then(r => r.json()).then(console.log).catch(console.error);
