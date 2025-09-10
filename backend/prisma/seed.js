/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Create a default node if none
  const nodeCount = await prisma.node.count();
  if (nodeCount === 0) {
    await prisma.node.create({
      data: {
        name: 'Default Node',
        location: 'US-East',
        ip: '10.0.0.10',
        status: 'online',
        capacity: 100,
      },
    });
    console.log('Seeded default Node');
  }

  // Create a couple of default active plans if none
  const planCount = await prisma.plan.count();
  if (planCount === 0) {
    await prisma.plan.createMany({
      data: [
        {
          name: 'Basic',
          pricePerMonth: '5.00',
          resources: { cpu: 100, ramMB: 2048, diskGB: 20 },
          isActive: true,
        },
        {
          name: 'Pro',
          pricePerMonth: '12.00',
          resources: { cpu: 200, ramMB: 4096, diskGB: 50 },
          isActive: true,
        },
      ],
    });
    console.log('Seeded default Plans: Basic, Pro');
  }

  console.log('Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });