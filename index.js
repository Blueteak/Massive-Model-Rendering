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
    streamBuffers = require('stream-buffers');

var MultiPartUpload = require('knox-mpu');


var app = express();
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(multipart());

//Setup Redis Connection
var redisClient = redis.createClient('32768','192.168.99.100');
redisClient.on('ready', function(){
    console.log('Redis Connected');
    redisClient.set('TargValue', 200);
});

//Setup Knox Connection
var client = knox.createClient({
    key: '00',
    secret: '00',
    bucket: 'testBucket',
    endpoint: '192.168.99.100',
    port: 32769
});


//File upload from Resumable.js
app.post('/upload', function(req, res)
{
    var objID = req.body['resumableIdentifier'];

    var numberOfChunks = Math.max(Math.floor(req.body['resumableTotalSize']/(req.body['resumableChunkSize']*1.0)), 1);
    var progress = (req.body['resumableChunkNumber']/numberOfChunks);

    progress = Math.floor(progress*100)/100.0;
    var file = '/'+objID+'.txt';

    var readBuff = new streamBuffers.ReadableStreamBuffer({
        frequency: 10,       // in milliseconds.
        chunkSize: 2048     // in bytes.
    });

    //Create s3 Pipeline
    var R = client.put(file, {
        'Content-Length': req.body['resumableTotalSize']
        , 'Content-Type': 'text/plain'
    });
    readBuff.pipe(R);
    R.on('progress', function(written, total, percent)
    {
        console.log("Uploaded " + percent + "% to s3");
    });
    R.on('response', function(res)
    {
        console.log("Uploaded");
    });

    //Upload to s3
    var echoStream = new stream.Writable();
    echoStream._write = function (chunk, encoding, done) {
        var b = new Buffer(chunk);
        readBuff.put(b);
        done();
    };
    resumable.write(objID, echoStream);

    //Send response back to uploader
    resumable.post(req, function(status, filename, original_filename, identifier)
    {
        console.log('POST', status, original_filename, identifier, "Progress: " + progress+"/1");
        //On Completed upload, update redis
        if(progress >= 1)
        {
           // SendToRedis(objID,file);
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
        percent: 0
    };

    redisClient.set('Model:'+modelid, JSON.stringify(modelInfo), function(err, reply) {
        if(!err)
        {
            checkCompletion(modelInfo.id);
            redisClient.lpush('ModelQ', JSON.stringify(model), function(err, reply) {
                console.log(reply);
            });
        }
        console.log('Added Test Data');
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