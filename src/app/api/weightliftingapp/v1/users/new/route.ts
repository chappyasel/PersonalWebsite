// import { z } from 'zod';
// import { NextResponse, type NextRequest } from 'next/server';

// const userSchema = z.object({
//   id: z.string(),
//   deviceUUID: z.string(),
// });

// export async function POST(req: NextRequest) {
//   try {
//     const parsedBody = userSchema.parse(req.body);

//     // Check if user already exists (pseudo code, replace with actual logic)
//     const userExists = false; // Replace with actual check
//     if (userExists) {
//       return NextResponse.json({ error: 'UserAlreadyExists' }, { status: 400 });
//     }

//     // Create new user (pseudo code, replace with actual logic)
//     const newUser = { id: parsedBody.id, deviceUUID: parsedBody.deviceUUID }; // Replace with actual creation logic

//     return NextResponse.json({ user: newUser });
//   } catch (error) {
//     if (error instanceof z.ZodError) {
//       return NextResponse.json({ error: error.errors }, { status: 400 });
//     } else {
//       return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
//     }
//   }
// }


