export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json(
    { data: { status: 'ok' } },
    {
      headers: {
        'cache-control': 'no-store',
      },
    },
  )
}
