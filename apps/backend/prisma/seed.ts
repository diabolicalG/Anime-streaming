import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.log('Skipping seed in production');
    return;
  }

  const email = process.env.DEMO_USER_EMAIL || 'demo@example.com';
  const username = process.env.DEMO_USER_USERNAME || 'demo';
  const password = process.env.DEMO_USER_PASSWORD || 'changeme123';

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      username,
      passwordHash,
      role: Role.USER,
      emailVerified: true,
    },
  });

  console.log('Seeded demo user:', email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
