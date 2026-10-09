require("dotenv").config();
const express = require("express")
const multer = require("multer")
const path = require("path")

//Cliente que gestiona servicio AWS
const { RekognitionClient, DetectLabelsCommand } = require("@aws-sdk/client-rekognition");
const { execArgv } = require("process");

const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");

const textractClient = new TextractClient({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: "http://localhost:4566",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test"
  }
});

const app = express()
const port = process.env.PORT || 3000

//OPCIONAL (considerarse cuando se realice pruebas con FLOCI)
const { mockClient } = require("aws-sdk-client-mock");
const rekognitionMock = mockClient(RekognitionClient)
//const textractMock = mockClient(TextractClient);

//Indicar el servicio de reconocimiento

const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION,
  endpoint: "http://localhost:4566",
  credentials:{
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

//Definir la respuesta perosnalizada
//Cliente detecte un evento, devolvera... 
rekognitionMock.on(DetectLabelsCommand).resolves({
  Labels: [
    { Name: 'Hombre', Confidence: 99.4 },
    { Name: 'Niño', Confidence: 95.2 },
    { Name: 'Perro', Confidence: 70.1 },
    { Name: 'Mujer', Confidence: 98.4 }
  ]
})

/*textractMock.on(DetectDocumentTextCommand).resolves({
  DocumentMetadata: { Pages: 1 },
  Blocks: [
    {
      BlockType: "LINE",
      Text: "DetectDocument", 
      Confidence: 99.9,
      Id: "demo-block-id-1"
    }
  ]
});*/

const upload = multer({storage: multer.memoryStorage()})

app.use(express.static(path.join(__dirname, "public")))
app.use(express.json())


//Ruta procesar imagen
app.post("/api/analizar",  upload.single("imagen"), async(req, res) =>{
  try{
  
    if (!req.file){
      return res.status(400).json({ error: 'No adjuntó una imagen válida' })
    }

    //El buffer de la imagen subida
    const imageBuffer = req.file.buffer

    //Configurar el comando para detectar etiquetas (ML Machine Learning / simulación)
    const params = {
      Image: {Bytes: imageBuffer},
      MaxLabels: 10,
      MinConfidence: 75
    }

    //Instanciar el comando de detección
    const command = new DetectLabelsCommand(params)
    const response = await rekognitionClient.send(command)

    res.json({
      success: true,
      labels: response.Labels
    })


  }catch(error){
    console.error("Error en el servidor AWS" + error)
    res.status(500).json({
      error: "No se concreto el analisis en AWS Rekognition",
      details: error.message,
      code: error.name
    })
  }
})

app.post("/api/analizar-documento", upload.single("documento"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No adjuntó un archivo PDF válido' });
    }

    const documentBuffer = req.file.buffer;

    const params = {
      Document: {
        Bytes: documentBuffer
      }
    };

    const command = new DetectDocumentTextCommand(params);
    const response = await textractClient.send(command);

    // Imprime la respuesta en la consola para confirmar
    console.log("Respuesta de Floci exitosa:", response);

    // Enviamos la respuesta asegurándonos de que rawBlocks no vaya vacío
    res.json({
      success: true,
      metadata: response?.DocumentMetadata || { Pages: 0 },
      rawBlocks: response?.Blocks || [] 
    });

  } catch (error) {
    console.error("Error en el servidor AWS Textract: " + error);
    res.status(500).json({
      success: false,
      error: "No se concretó la extracción de texto en AWS Textract",
      details: error.message
    });
  }
});

app.listen(port, ()=>{
  console.log("Servidor corriendo en http://localhost:" + port)
})
