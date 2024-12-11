import fs from "fs";
import path from "path";
import OpenAI from "openai";
import dotenv from "dotenv";
import { GraphAI } from "graphai";
import * as agents from "@graphai/agents";
import { fileWriteAgent } from "@graphai/vanilla_node_agents";
import ffmpeg from "fluent-ffmpeg";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const nijovoiceApiKey = process.env.NIJIVOICE_API_KEY ?? "";

const tts_openAI = async (filePath: string, input: string, key: string, speaker: string) => {
  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: (speaker === "Host") ? "shimmer" : "echo",
    // response_format: "aac",
    input,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  //  console.log(filePath, buffer);
  return { buffer, filePath };
};

const tts_nijivoice = async (filePath: string, input: string, key: string, speaker: string) => {
  const voiceId = (speaker === "Host") ? "b9277ce3-ba1c-4f6f-9a65-c05ca102ded0" : "bc06c63f-fef6-43b6-92f7-67f919bd5dae";
  const url = `https://api.nijivoice.com/api/platform/v1/voice-actors/${voiceId}/generate-voice`;
  const options = {
    method: 'POST',
    headers: {
      "x-api-key": nijovoiceApiKey,
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      format: 'mp3',
      speed: '1.0',
      script: input
    })
  };

  try {
    const res = await fetch(url, options)
    const json: any = await res.json();
    //console.log(json)
    const res2 = await fetch(json.generatedVoice.audioFileDownloadUrl);
    // Get the MP3 data as a buffer
    const buffer = Buffer.from(await res2.arrayBuffer());
    console.log(`sound generated: ${key}, ${buffer.length}`);
    return { buffer, filePath };
    // await fs.promises.writeFile(filePath, buffer);
  } catch(e) {
    console.error(e);
  }
};

const text2speech = async (input: { text: string; key: string, speaker: string, script: any }) => {
  const filePath = path.resolve("./scratchpad/" + input.key + ".mp3");
  const tts = input.script.tts ?? "openAI";
  if (fs.existsSync(filePath)) {
    console.log("skpped", input.key, input.speaker, tts);
  } else {
    console.log("generating", input.key, input.speaker, tts);
    if (tts === "openAI") {
      return await tts_openAI(filePath, input.text, input.key, input.speaker);
    } else if (tts === "nijivoice") {
      return await tts_nijivoice(filePath, input.text, input.key, input.speaker);
    } else {
      throw Error("Invalid TTS: " + tts);
    }
  }
  return true;
};

const combineFiles = async (inputs: { jsonData: any; name: string }) => {
  const { name, jsonData } = inputs;
  const outputFile = path.resolve("./output/" + name + ".mp3");
  const silentPath = path.resolve("./music/silent300.mp3");
  const silentLastPath = path.resolve("./music/silent800.mp3");
  const command = ffmpeg();
  jsonData.script.forEach((element: any, index: number) => {
    const filePath = path.resolve("./scratchpad/" + element.key + ".mp3");
    const isLast = index === jsonData.script.length - 2;
    command.input(filePath);
    command.input(isLast ? silentLastPath : silentPath);
    // Measure and log the timestamp of each section
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error("Error while getting metadata:", err);
      } else {
        element["duration"] = metadata.format.duration! + (isLast ? 0.8 : 0.3);
      }
    });
  });

  const promise = new Promise((resolve, reject) => {
    command
      .on("end", () => {
        console.log("MP3 files have been successfully combined.");
        resolve(0);
      })
      .on("error", (err: any) => {
        console.error("Error while combining MP3 files:", err);
        reject(err);
      })
      .mergeToFile(outputFile, path.dirname(outputFile));
  });

  await promise;

  const outputScript = path.resolve("./output/" + name + ".json");
  fs.writeFileSync(outputScript, JSON.stringify(jsonData, null, 2));

  return outputFile;
};

const addMusic = async (inputs: {
  voiceFile: string;
  name: string;
}) => {
  const { voiceFile, name } = inputs;
  const outputFile = path.resolve("./output/" + name + "_bgm.mp3");
  const musicFile = path.resolve(process.env.PATH_BGM ?? "./music/StarsBeyondEx.mp3");
  ffmpeg.ffprobe(voiceFile, (err, metadata) => {
    if (err) {
      console.error("Error getting metadata: " + err.message);
      return;
    }

    const speechDuration = metadata.format.duration;
    const totalDuration = 8 + Math.round(speechDuration ?? 0);
    console.log("totalDucation:", speechDuration, totalDuration);

    const command = ffmpeg();
    command
      .input(musicFile)
      .input(voiceFile)
      .complexFilter([
        // Add a 2-second delay to the speech
        "[1:a]adelay=4000|4000, volume=4[a1]", // 4000ms delay for both left and right channels
        // Set the background music volume to 0.2
        `[0:a]volume=0.2[a0]`,
        // Mix the delayed speech and the background music
        `[a0][a1]amix=inputs=2:duration=longest:dropout_transition=3[amixed]`,
        // Trim the output to the length of speech + 8 seconds
        `[amixed]atrim=start=0:end=${totalDuration}[trimmed]`,
        // Add fade out effect for the last 4 seconds
        `[trimmed]afade=t=out:st=${totalDuration - 4}:d=4`,
      ])
      .on("error", (err) => {
        console.error("Error: " + err.message);
      })
      .on("end", () => {
        console.log("File has been created successfully");
      })
      .save(outputFile);
  });
  return outputFile;
};

const graph_data = {
  version: 0.5,
  concurrency: 1, // for nijovoice
  nodes: {
    name: {
      value: "",
    },
    jsonData: {
      value: {},
    },
    map: {
      agent: "mapAgent",
      inputs: { rows: ":jsonData.script", script: ":jsonData" },
      graph: {
        nodes: {
          b: {
            agent: text2speech,
            inputs: {
              text: ":row.text",
              key: ":row.key",
              speaker: ":row.speaker",
              script: ":script",
            },
            console: { after: true},
          },
          w: {
            console: { after: true, before: true},
            agent: "fileWriteAgent",
            priority: 1,
            inputs: {
              file: ":b.filePath",
              text: ":b.buffer",
            },
            params: {
              baseDir: "/",
            },
          },
        },
      },
    },
    combineFiles: {
      agent: combineFiles,
      inputs: { map: ":map", jsonData: ":jsonData", name: ":name" },
      isResult: true,
    },
    addMusic: {
      agent: addMusic,
      inputs: {
        voiceFile: ":combineFiles",
        name: ":name",
      },
      isResult: true,
    },
    title: {
      agent: "copyAgent",
      params: {
        namedKey: "title"
      },
      console: {
        after: true
      },
      inputs: {
        title: "\n${:jsonData.title}\n\n${:jsonData.description}\nReference: ${:jsonData.reference}\n",
        waitFor: ":addMusic"
      }
    },
    /*
    translate: {
      agent: "openAIAgent",
      inputs: {
        prompt: "Translate all the text in this JSON file into Japanese, leaving the JSON format as is. \n ${:jsonData.toJSON()}",
      }
    },
    wwriteTranslate: {
      agent: writeTranslatedJson,
      inputs: { jsonData: ":translate.text.jsonParse()", name: ":name" },
    }
    */
  },
};

const main = async () => {
  const arg2 = process.argv[2];
  const scriptPath = path.resolve(arg2);
  const parsedPath = path.parse(scriptPath);
  const name = parsedPath.name;
  const data = fs.readFileSync(scriptPath, "utf-8");
  const jsonData = JSON.parse(data);
  jsonData.script.forEach((element: any, index: number) => {
    element["key"] = name + index;
  });

  const graph = new GraphAI(graph_data, { ...agents, fileWriteAgent });
  graph.injectValue("jsonData", jsonData);
  graph.injectValue("name", name);
  const results = await graph.run();
  console.log(results);

  // const voiceFile = await combineFiles(jsonData, name);
  // await addMusic(jsonData, voiceFile, name);
};

main();
