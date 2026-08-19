import 'dotenv/config'
import { runSalesAgentTurn } from './lib/sales-agent/orchestrator/run-turn.ts'

async function run() {
  const result = await runSalesAgentTurn({
    turnId: '123',
    messageId: 'msg-123',
    sessionId: 'ses-123',
    input: 'cổng sạc xe vf3 2024 nằm ở đâu',
    mode: 'chat',
    context: { recentMessages: [] }
  })
  console.log(JSON.stringify(result, null, 2))
}
run()
