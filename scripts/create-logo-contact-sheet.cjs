const path = require("path");
const sharp = require("sharp");

const outputDirectory = path.resolve("design/brand-options");
const optionNames = ["a", "b", "c", "d"];

async function createContactSheet() {
  const width = 1120;
  const height = 1120;
  const cellSize = 520;
  const outerPadding = 40;
  const gap = 40;
  const composites = [];

  for (let index = 0; index < optionNames.length; index += 1) {
    const optionName = optionNames[index];
    const left = outerPadding + (index % 2) * (cellSize + gap);
    const top = outerPadding + Math.floor(index / 2) * (cellSize + gap);
    const panel = await sharp({
      create: {
        width: cellSize,
        height: cellSize,
        channels: 4,
        background: "#f7f0dd",
      },
    })
      .png()
      .toBuffer();
    const icon = await sharp(
      path.join(outputDirectory, `shanjian-logo-option-${optionName}.png`),
    )
      .resize(390, 390, { fit: "contain" })
      .png()
      .toBuffer();
    const label = Buffer.from(`
      <svg width="80" height="80" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="40" r="32" fill="#9f3e2d" />
        <text x="40" y="52" font-family="Arial" font-size="36" font-weight="700"
          text-anchor="middle" fill="#fff8e8">${optionName.toUpperCase()}</text>
      </svg>
    `);

    composites.push(
      { input: panel, left, top },
      { input: icon, left: left + 65, top: top + 68 },
      { input: label, left: left + 18, top: top + 18 },
    );
  }

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#e9dfc6",
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(outputDirectory, "shanjian-logo-options-contact-sheet.png"));
}

createContactSheet().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
