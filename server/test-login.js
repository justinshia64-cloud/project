import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function testLogin() {
  const email = "technician1@gmail.com";
  const password = "secret123";

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log("User not found!");
      return;
    }

    console.log("User found:", {
      id: user.id,
      email: user.email,
      role: user.role,
      hashedPassword: user.password
    });

    const isMatch = await bcrypt.compare(password, user.password);
    console.log("Password matches:", isMatch);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testLogin();