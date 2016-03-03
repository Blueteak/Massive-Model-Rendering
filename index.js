/**
 * Created by jonathanschenker on 1/28/16.
 */
var express     = require('express'),
    bodyParser  = require('body-parser'),
    redis       = require('redis'),
    knox        = require('knox'),
    resumable   = require('./resumable-node.js')('/tmp/resumable.js/'),
    multipart   = require('connect-multiparty'),
    fs          = require('fs'),
    stream      = require('stream'),
    streamBuffers = require('stream-buffers'),
    util = require('util');
    MultiPartUpload = require('knox-mpu-alt');

var config      = require('config.json')('./sample.json');


var app = express();
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(multipart());

//Setup Redis Connection
var redisClient = redis.createClient(config.redis.port,config.redis.host);
var subClient = redis.createClient(config.redis.port,config.redis.host);

redisClient.on('ready', function(){
    console.log('Redis Connected');
    redisClient.set('TargValue', 200);
});
subClient.on('ready', function(){
    console.log('Redis Connected');
    subClient.set('TargValue', 200);
});

//Setup Knox Connection
var client = knox.createClient({
    key: config.s3.key,
    secret: config.s3.secret,
    bucket: config.s3.bucket
    // endpoint: '192.168.99.100',
    // port: 32769
});

//var echoStream = new stream.Writable();
upload = null;
streams = {};
buffers = {};
chunks = {};


//File upload from Resumable.js
app.post('/upload', function(req, res)
{
    var objID = req.body['resumableIdentifier'];
    var numberOfChunks = Math.max(Math.floor(req.body['resumableTotalSize']/(req.body['resumableChunkSize']*1.0)), 1);
    var progress = (req.body['resumableChunkNumber']/numberOfChunks);
   // var chunk = req.body['file'].file;

    progress = Math.floor(progress*100)/100.0;
    var file = objID+'.txt';

    if(streams[objID] == null)
    {
        chunks[objID] = 0;

        buffers[objID] = new streamBuffers.ReadableStreamBuffer({
            frequency: 10,       // in milliseconds.
            chunkSize: 1024*1024  // in bytes.
        });
        streams[objID] = new stream.Writable();
        streams[objID]._write = function (chunk, encoding, done) {
            console.log("Stream Writing Data");
            var b = new Buffer(chunk);
            buffers[objID].put(b);
            done();
        };
        streams[objID].on('pipe', function (src){
                console.log("Data Recieved from Pipe")
        });
        buffers[objID].on('data', function(){
           console.log('Buffer stream got data');
        });
        /*
        upload = new MultiPartUpload(
            {
                client: client,
                objectName: 'temp.txt', // Amazon S3 object name
                stream: buffers[objID],
                noDisk: true
            },
            // Callback handler
            function(err, body) {
                console.log("success");
            }
        );

        upload.on('initiated', function(){
            console.log("Upload to s3 initiated");
        });
        upload.on('failed', function(id, err){
            console.log("Upload to s3 failed: " + err);
        });
        upload.on('uploading', function(){
            console.log("Uploading to s3...");
        });
        upload.on('uploaded', function(){
            console.log("Uploaded part to s3");
            if(chunks[objID] == numberOfChunks)
            {
                //Done with Uploading File
                SendToRedis(objID, file);
            }
        });
        */
    }
    chunks[objID]++;
    resumable.write(objID, streams[objID]);
    SendToRedis('teapotsLarge','teapotsLarge.txt');
    //Send response back to uploader
    resumable.post(req, function(status, filename, original_filename, identifier)
    {
        console.log('POST', status, original_filename, identifier, "Progress: " + progress+"/1");
        //On Completed upload, update redis
        if(progress >= 1)
        {
           console.log("Upload to Server completed");
            streams[objID].end();
        }
        res.status(status).send( {
            // NOTE: Uncomment this funciton to enable cross-domain request.
            //'Access-Control-Allow-Origin': '*'
        });
    });
});


function SendToRedis(modelid, filename)
{
    var model = {
        id: modelid,
        filename: filename
    };

    var modelInfo = {
        id: modelid,
        started: false,
        done: false,
        percent: 0,
        updURL: ""
    };

    redisClient.set('Model'+modelid, JSON.stringify(modelInfo), function(err, reply) {
        if(!err)
        {
            redisClient.lpush('ModelQ', JSON.stringify(model), function(err, reply) {
                if(!err) {
                    console.log('Redis Data Set');
                    checkCompletion('Model'+modelid);
                }
            });
        }

    });
}

function checkCompletion(id)
{
    subClient.subscribe(id);
    var isDone = false;
    subClient.on('message', function(channel, msg)
    {
            redisClient.get(channel, function (err, reply) {
                if (err)
                    console.log(err)
                var model = JSON.parse(reply);
                if (model) {
                    var perc = model.percent;
                    if(model.done && !isDone)
                    {
                        isDone = true;
                        console.log("Model Processing Complete!");
                        //console.log("Modified File at: " + model.updURL);
                        subClient.unsubscribe(id);
                    }
                    else if (model.started && !isDone)
                        console.log("Model Processing: " + perc + "% complete");


                }
            });
        //}
    });
}

function download(filename)
{
    if(uploaded)
    {
        client.get('/'+filename).on('response', function(res){
            console.log(res.statusCode);
            console.log(res.headers);
            res.setEncoding('utf8');
            res.on('data', function(chunk){
                console.log(chunk);
            });
        }).end();
    }
}

var server = app.listen(8080, function () {
    console.log('Server listening on ' + server.address().port);
});