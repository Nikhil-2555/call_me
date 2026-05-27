const BatchCall = require("../models/BatchCall");

async function processBatches() {
  try {
    const now = Math.floor(Date.now() / 1000);
    
    // Find batches that are in_progress, or pending but scheduled in the past
    const batches = await BatchCall.find({
      $or: [
        { status: "in_progress" },
        { status: "pending", scheduled_time_unix: { $lte: now } }
      ]
    });

    for (const batch of batches) {
      if (batch.status === "pending") {
        batch.status = "in_progress";
        await batch.save();
      }

      for (const recipient of batch.recipients) {
        if (recipient.status === "pending") {
          try {
            console.log(`[Batch ${batch.name}] Dialing ${recipient.phone_number}...`);
            
            // Mark as in_progress to avoid double dialing
            recipient.status = "in_progress";
            await batch.save();
            
            // Call the local outbound API to initiate the call
            const port = process.env.PORT || 8000;
            const res = await fetch(`http://localhost:${port}/call/outbound`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to_number: recipient.phone_number,
                agent_id: batch.agent_id,
                agent_phone_number_id: batch.agent_phone_number_id
              })
            });
            
            if (res.ok) {
              recipient.status = "completed";
              batch.total_calls_dispatched += 1;
            } else {
              const errData = await res.json().catch(()=>({}));
              console.error(`[Batch ${batch.name}] Call failed for ${recipient.phone_number}:`, errData.detail);
              recipient.status = "failed";
            }
          } catch (e) {
            console.error(`[Batch ${batch.name}] Error dialing ${recipient.phone_number}:`, e.message);
            recipient.status = "failed";
          }
          
          recipient.updated_at_unix = Math.floor(Date.now() / 1000);
          batch.last_updated_at_unix = Math.floor(Date.now() / 1000);
          await batch.save();
          
          // Wait 3 seconds between calls to avoid Twilio rate limits
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      // If all recipients are processed (completed or failed), mark batch as completed
      const pendingCount = batch.recipients.filter(r => r.status === "pending" || r.status === "in_progress").length;
      if (pendingCount === 0) {
        batch.status = "completed";
        batch.last_updated_at_unix = Math.floor(Date.now() / 1000);
        await batch.save();
        console.log(`✅ [Batch ${batch.name}] Completed.`);
      }
    }
  } catch (error) {
    console.error("Batch worker error:", error);
  }
}

function startBatchWorker() {
  console.log("🚀 Batch worker scheduled (runs every 10 seconds)");
  setInterval(processBatches, 10000); // Check every 10 seconds
}

module.exports = { startBatchWorker };
