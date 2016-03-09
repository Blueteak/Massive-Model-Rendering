/* Load System */
/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
var redis       = require('redis'),
    knox        = require('knox'),
    fs          = require('fs'),
    split       = require('split'),
    stream      = require('stream'),
    MultiPartUpload = require('knox-mpu-alt'),
    objParse    = require('objparse'),
    objParts    = require('./modelSplit.js'),
    wait        = require('wait.for');
var config      = require('config.json')('./sample.json');


var client = knox.createClient({
    key: config.s3.Docker.key,
    secret: config.s3.Docker.secret,
    bucket: config.s3.Docker.bucket,
    endpoint: config.s3.Docker.endpoint,
    port: config.s3.Docker.port
});

var useStorage = true; //Enable/Disable Usage of external (currently s3) storage

var redisClient = redis.createClient(config.redis.port,config.redis.host);
redisClient.on('ready', function(){
    console.log('Redis Connected');
    redisClient.set('TargValue', 200);
});

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
console.log("Async Model Processor running...");
worker();

//Continually scans Redis Q for new models
function worker()
{
    setTimeout(function() {
        worker();
    }, 1000);
    redisClient.brpop('ModelQ', 1, function(err, data) {
        if(err != null)
            console.log(err);
        if(data == null)
            return;
        var model = JSON.parse(data[1]);
        setModelInfo(model.id, 5, true, false, "");
        var file = model.filename;

        //Download and write file to disk
        var writeFile = fs.createWriteStream(file);
        client.getFile('/'+file, function(err, res){
            if(!err)
                res.pipe(writeFile);
        });

        writeFile.on('finish', function()
        {
            console.log('Downloaded File');
            editFile(model, file);
            //wait.launchFiber(editFile, model, file);
        });
    });
}

//var uploading = false;

//Do pre processing
function editFile(model, uri)
{
    setModelInfo(model.id, 20, true, false, "");
    //Parse file into huge JSON object
    objParse(fs.createReadStream(uri), function(err, object) {
        if(err) {
            throw new Error("Error parsing OBJ file: " + err)
        }
        setModelInfo(model.id, 30, true, false, "");
        object = objParts.split(object);
        var bounds = objParts.getBounds(object);
        //Upload to s3
        wait.launchFiber(uploadParts, bounds, object, model.id, uri);
    });
}

//upload all parts of model to s3 serially
function uploadParts(bounds, object, id, url)
{
    wait.for(uploadObj, bounds, id+':bounds');
    console.log("Uploaded model bounds");
    setModelInfo(id, 50, true, false, "");
    console.log("Uploading parts");
    for(var o = 0; o < object.length; o++) {
        console.log("Uploading object: " + o);
        setModelInfo(id, 50 + parseInt((((o + 0.00) / object.length) * 40.0)), true, false, "");
        var uri = id + ":obj" + o;
        wait.for(uploadObj, object[o], uri);
    }
    console.log("Done uploading parts");
    setModelInfo(id, 100, true, true, "");
    fs.unlink(url);
}

//Upload model object to s3
function uploadObj(obj, uri, callback)
{
    var objStr = JSON.stringify(obj);
    var req = client.put(uri, {
        'Content-Length': Buffer.byteLength(objStr)
        , 'Content-Type': 'application/json'
    });
    req.on('response', function(res)
    {
        if(res.statusCode == 200) {

            callback();
        }
        else
        {
            console.log("Error uploading");
        }
    });
    req.end(objStr);
}

//Emit message to redis with update on progress
function setModelInfo(id, perc, started, done, endURL)
{
    redisClient.get('Model'+id, function(err, reply)
    {
        if(err)
            console.log(err);
        var modelInfo = JSON.parse(reply);
        modelInfo.started = started;
        modelInfo.done = done;
        modelInfo.percent = perc;
        modelInfo.updURL = endURL;
        redisClient.set('Model'+id, JSON.stringify(modelInfo), function(err, reply)
        {
            redisClient.publish('Model'+id, "Update");
            if(err)
                console.log(err);
        });
    });
}
