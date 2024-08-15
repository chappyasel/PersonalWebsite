// import { type NextRequest, NextResponse } from 'next/server';
// import { z } from 'zod';

// // Define the schema for the request parameters
// const paramsSchema = z.object({
//   userId: z.string(),
// });

// export async function GET(req: NextRequest) {
//   try {
//     // Parse the request parameters
//     const { searchParams } = new URL(req.url);
//     const userId = searchParams.get('userId');
//     const params = paramsSchema.parse({ userId });

//     // Placeholder for database query logic
//     // const user = await getUserById(params.userId);

//     // For now, return a mock response
//     const user = { id: params.userId, name: "John Doe" }; // Replace with actual user from the database

//     return NextResponse.json({ user }, { status: 200 });
//   } catch (error) {
//     return NextResponse.json({ error: error }, { status: 400 });
//   }
// }
