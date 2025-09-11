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

  // Seed server-size plans if none exist
  const planCount = await prisma.plan.count();
  if (planCount === 0) {
    await prisma.plan.createMany({
      data: [
        {
          name: 'Server • 4 GB RAM',
          pricePerMonth: '8.00',
          resources: { cpu: 200, ramMB: 4096, diskGB: 40 },
          isActive: true,
        },
        {
          name: 'Server • 6 GB RAM',
          pricePerMonth: '12.00',
          resources: { cpu: 300, ramMB: 6144, diskGB: 60 },
          isActive: true,
        },
        {
          name: 'Server • 8 GB RAM',
          pricePerMonth: '16.00',
          resources: { cpu: 400, ramMB: 8192, diskGB: 80 },
          isActive: true,
        },
        {
          name: 'Server • 16 GB RAM',
          pricePerMonth: '30.00',
          resources: { cpu: 800, ramMB: 16384, diskGB: 160 },
          isActive: true,
        },
      ],
    });
    console.log('Seeded server-size Plans: 4 GB, 6 GB, 8 GB, 16 GB');
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