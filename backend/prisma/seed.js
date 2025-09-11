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

  // Ensure server-size plans exist (create if missing)
  const defaultPlans = [
    {
      name: 'Server • 4 GB RAM',
      pricePerMonth: '8.00',
      resources: { cpu: 200, ramMB: 4096, diskGB: 40, maxServers: 1 },
    },
    {
      name: 'Server • 6 GB RAM',
      pricePerMonth: '12.00',
      resources: { cpu: 300, ramMB: 6144, diskGB: 60, maxServers: 1 },
    },
    {
      name: 'Server • 8 GB RAM',
      pricePerMonth: '16.00',
      resources: { cpu: 400, ramMB: 8192, diskGB: 80, maxServers: 1 },
    },
    {
      name: 'Server • 16 GB RAM',
      pricePerMonth: '30.00',
      resources: { cpu: 800, ramMB: 16384, diskGB: 160, maxServers: 1 },
    },
    {
      name: 'Server • Custom (32–128 GB RAM)',
      // pricePerMonth is not used directly; pricing is per-GB in resources
      pricePerMonth: '0.00',
      resources: {
        ramRange: { minMB: 32768, maxMB: 131072 },
        pricePerGB: 2.5, // GBP per GB per month
        cpuPerGB: 50,     // CPU units per GB (for future enforcement)
        diskPerGB: 5,     // Disk GB per GB RAM (for future enforcement)
        maxServers: 1,
      },
    },
  ];

  for (const p of defaultPlans) {
    const existing = await prisma.plan.findFirst({ where: { name: p.name } });
    if (!existing) {
      await prisma.plan.create({
        data: { name: p.name, pricePerMonth: p.pricePerMonth, resources: p.resources, isActive: true },
      });
      console.log(`Created plan: ${p.name}`);
    } else {
      // For the custom plan, backfill missing per-GB price/range if not present
      if (p.name.includes('Custom') && (!existing.resources?.pricePerGB || !existing.resources?.ramRange)) {
        await prisma.plan.update({
          where: { id: existing.id },
          data: {
            resources: {
              ...existing.resources,
              pricePerGB: existing.resources?.pricePerGB ?? p.resources.pricePerGB,
              ramRange: existing.resources?.ramRange ?? p.resources.ramRange,
            },
          },
        });
        console.log('Backfilled custom plan per-GB settings');
      }
    }
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