import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { createCanvas, loadImage } from "canvas";

const canvasWidth = 1280; // not 1920
const canvasHeight = 720; // not 1080

async function renderJapaneseTextToPNG(text: string, outputFilePath: string) {
  const fontSize = 48;
  const paddingX = 48 * 2;
  const paddingY = 12;
  const lineHeight = fontSize + 8;

  const lines: string[] = [];
  let currentLine = "";
  let currentWidth = 0;

  // Iterate over each character and determine line breaks based on character width estimate
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);
    const isAnsi = code < 255;
    const isCapital = code >= 0x40 && code < 0x60;
    const charWidth = isAnsi
      ? isCapital
        ? fontSize * 0.8
        : fontSize * 0.5
      : fontSize;
    const isTrailing =
      char === "。" || char === "、" || char === "？" || char === "！";

    if (char === "\n") {
      lines.push(currentLine);
      currentLine = "";
      currentWidth = 0;
    } else if (
      currentWidth + charWidth > canvasWidth - paddingX * 2 &&
      !isTrailing
    ) {
      lines.push(currentLine);
      currentLine = char;
      currentWidth = charWidth;
    } else {
      currentLine += char;
      currentWidth += charWidth;
    }
  }

  // Push the last line if there's any remaining text
  if (currentLine) {
    lines.push(currentLine);
  }

  const textHeight = lines.length * lineHeight + paddingY * 2;
  const textTop = canvasHeight - textHeight;

  // Create a canvas and a drawing context
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const context = canvas.getContext("2d");

  // Set background color
  context.fillStyle = "rgba(0, 0, 0, 0.5)";
  context.fillRect(0, textTop, canvasWidth, textHeight);

  // Set text styles
  context.font = `bold ${fontSize}px Arial`;
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "top";

  // Set shadow properties
  context.shadowColor = "rgba(0, 0, 0, 0.8)";
  context.shadowOffsetX = 5;
  context.shadowOffsetY = 5;
  context.shadowBlur = 10;

  lines.forEach((line: string, index: number) => {
    context.fillText(
      line,
      canvasWidth / 2,
      textTop + lineHeight * index + paddingY,
    );
  });

  // Save the image
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(outputFilePath, buffer);

  console.log(`Image saved to ${outputFilePath}`);
}

interface ImageDetails {
  path: string;
  duration: number; // Duration in seconds for each image
}

const createVideo = (
  audioPath: string,
  images: ImageDetails[],
  outputVideoPath: string,
) => {
  let command = ffmpeg();

  // Add each image input
  images.forEach((image) => {
    command = command.input(image.path);
  });

  // Build filter_complex string to manage start times
  const filterComplexParts: string[] = [];

  images.forEach((image, index) => {
    // Add filter for each image
    filterComplexParts.push(
      // `[${index}:v]scale=${canvasWidth}:${canvasHeight},setsar=1,format=yuv420p,trim=duration=${image.duration},setpts=${startTime}/TB[v${index}]`,
      `[${index}:v]scale=${canvasWidth * 4}:${canvasHeight * 4},setsar=1,format=yuv420p,zoompan=z=zoom+0.0004:x=iw/2-(iw/zoom/2):y=ih-(ih/zoom):s=${canvasWidth}x${canvasHeight}:fps=30:d=${image.duration * 30},trim=duration=${image.duration}[v${index}]`,
    );
  });

  // Concatenate the trimmed images
  const concatInput = images.map((_, index) => `[v${index}]`).join("");
  filterComplexParts.push(`${concatInput}concat=n=${images.length}:v=1:a=0[v]`);

  // Apply the filter complex for concatenation and map audio input
  command
    .complexFilter(filterComplexParts)
    .input(audioPath) // Add audio input
    .outputOptions([
      "-map [v]", // Map the video stream
      "-map " + images.length + ":a", // Map the audio stream (audio is the next input after all images)
      "-c:v libx264", // Set video codec
      "-r 30", // Set frame rate
      "-pix_fmt yuv420p", // Set pixel format for better compatibility
    ])
    .on("start", (cmdLine) => {
      console.log("Started FFmpeg ..."); // with command:', cmdLine);
    })
    .on("error", (err, stdout, stderr) => {
      console.error("Error occurred:", err);
      console.error("FFmpeg stdout:", stdout);
      console.error("FFmpeg stderr:", stderr);
    })
    .on("end", () => {
      console.log("Video created successfully!");
    })
    .output(outputVideoPath)
    .run();
};

const main = async () => {
  const arg2 = process.argv[2];
  const scriptPath = path.resolve(arg2);
  const parsedPath = path.parse(scriptPath);
  const name = parsedPath.name;
  const data = fs.readFileSync(scriptPath, "utf-8");
  const jsonData = JSON.parse(data);
  //
  await renderJapaneseTextToPNG(
    `${jsonData.title}\n\n${jsonData.description}`,
    `./scratchpad/${name}_00.png`, // Output file path
  ).catch((err) => {
    console.error("Error generating PNG:", err);
  });

  const promises = jsonData.script.map((element: any, index: number) => {
    return renderJapaneseTextToPNG(
      element["text"],
      `./scratchpad/${name}_${index}.png`, // Output file path
    ).catch((err) => {
      console.error("Error generating PNG:", err);
    });
  });
  await Promise.all(promises);

  const tmScriptPath = path.resolve("./output/" + name + ".json");
  const dataTm = fs.readFileSync(tmScriptPath, "utf-8");
  const jsonDataTm = JSON.parse(dataTm);

  // add images
  const imageInfo = jsonDataTm.imageInfo;
  await imageInfo.forEach(async (element: { index: number; image: string }) => {
    const { index, image } = element;
    if (image) {
      const imagePath = `./scratchpad/${name}_${index}.png`;
      const imageText = await loadImage(imagePath);
      const imageBG = await loadImage(image);
      const bgWidth = imageBG.width;
      const bgHeight = imageBG.height;
      const viewWidth = (bgWidth / bgHeight) * canvasHeight;
      const canvas = createCanvas(canvasWidth, canvasHeight);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        imageBG,
        (canvasWidth - viewWidth) / 2,
        0,
        viewWidth,
        canvasHeight,
      );
      ctx.drawImage(imageText, 0, 0);
      const buffer = canvas.toBuffer("image/png");
      fs.writeFileSync(imagePath, buffer);
    }
  });

  const audioPath = path.resolve("./output/" + name + "_bgm.mp3");
  const images: ImageDetails[] = jsonDataTm.script.map(
    (item: any, index: number) => {
      const duration = item.duration;
      return {
        path: path.resolve(`./scratchpad/${name}_${index}.png`),
        duration,
      };
    },
  );
  const outputVideoPath = path.resolve("./output/" + name + "_ja.mp4");
  const titleImage: ImageDetails = {
    path: path.resolve(`./scratchpad/${name}_00.png`),
    duration: 4,
  };
  const imagesWithTitle = [titleImage].concat(images);

  createVideo(audioPath, imagesWithTitle, outputVideoPath);
};

main();
