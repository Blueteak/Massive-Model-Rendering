/* Load System */
/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
var express     = require('express'),
    bodyParser  = require('body-parser'),
    redis       = require('redis'),
    knox        = require('knox'),
    http        = require('http');


var app = express();
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

var client = knox.createClient({
    key: '00',
    secret: '00',
    bucket: 'testBucket',
    endpoint: '192.168.99.100',
    port: 32769
});

var useStorage = true; //Enable/Disable Usage of external (currently s3) storage

var redisClient = redis.createClient('32768','192.168.99.100');
redisClient.on('ready', function(){
    console.log('Redis Connected');
    redisClient.set('TargValue', 200);
});

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
//worker();

testPut();

function testPut()
{
    http.get('http://google.com/doodle.png', function(res){
        var headers = {
            'Content-Length': res.headers['content-length']
            , 'Content-Type': res.headers['content-type']
        };
        client.putStream(res, '/doodle.png', headers, function(err, res){
            if(err)
                console.log(err)
            else
                console.log('Success!');
        });
    });
}
function testGrab()
{
    client.get('/test/obj.json').on('response', function(res){
        console.log(res.statusCode);
        console.log(res.headers);
        res.setEncoding('utf8');
        res.on('data', function(chunk){
            console.log(chunk);
        });
    }).end();
}

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
        console.log('processing: ' + model.id);
        if(useStorage)
        {
            /*
            var uploader = storage.uploadFile({
                localFile: "test.txt",
                s3Params: {
                    Bucket: "testredis",
                    Key: "test.txt"
                }
            });
            uploader.on('error', function(err) {
                console.error("unable to upload:", err.stack);
            });
            uploader.on('progress', function() {
                console.log("Upload s3 Progress: " + uploader.progressAmount+"/"+uploader.progressTotal);
            });
            */
        }
        setTimeout(function(){setModelInfo(model.id, 10, true, false)}, 1000);
        setTimeout(function(){setModelInfo(model.id, 30, true, false)}, 3000);
        setTimeout(function(){setModelInfo(model.id, 60, true, false)}, 5000);
        setTimeout(function(){setModelInfo(model.id, 100, true, true)}, 6000);
    });
}

function setModelInfo(id, perc, started, done)
{
    redisClient.get('Model'+id, function(err, reply)
    {
        if(err)
            console.log(err);
        var modelInfo = JSON.parse(reply);
        modelInfo.started = started;
        modelInfo.done = done;
        modelInfo.percent = perc;
        redisClient.set('Model'+id, JSON.stringify(modelInfo), function(err, reply)
        {
            if(err)
                console.log(err);
        });
    });
}

//Done elsewhere in final code
app.get('/addModelTest', function(req, res)
{
    console.log('Adding Test Data');
    var model = {
        id: 'ABC'
    }
    redisClient.lpush('ModelQ', JSON.stringify(model), function(err, reply) {
        console.log(reply);
    });
    var modelInfo = {
        id: 'ABC',
        started: false,
        done: false,
        percent: 0
    }
    redisClient.set('Model'+modelInfo.id, JSON.stringify(model), function(err, reply) {
        if(!err)
            checkCompletion(modelInfo.id);
        console.log('Added Test Data');
    });
});

//Scans Redis for completion message
function checkCompletion(id)
{
    redisClient.get('Model'+id, function(err, reply)
    {
        if(err)
            console.log(err)
        var model = JSON.parse(reply);
        if(model)
        {
            var perc = model.percent;
            if(model.started)
                console.log("Model Processing: " + perc +"% complete");
            if(!model.done)
                checkCompletion(id);
            else
                console.log("Model Processing Complete!");
        }
    });
}

var server = app.listen(8080, function () {
    console.log('Server listening on ' + server.address().port);
});