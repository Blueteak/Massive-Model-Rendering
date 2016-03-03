/**
 * Created by jonathanschenker on 1/28/16.
 */
var knox        = require('knox'),
    MultiPartUpload = require('knox-mpu-alt'),
    fs          = require('fs'),
    split       = require('split'),
    stream      = require('stream'),
    parseObj    = require('objparse');

//Setup Knox Connection
    /*
var client = knox.createClient({
    key: 'b8214946fbe245b7812e53cc9f748558',
    secret: 'a3de027dca414c0cba077035f7e4afc4',
    bucket: 'ModelUploads',
    endpoint: 'https://cloud.isis.vanderbilt.edu:8773/services/Cloud',
    style: 'openstack'
    //port: 5000
});
*/

var client = knox.createClient({
    key: 'AKIAIAVV5WMMTCERB3BQ',
    secret: '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',
    bucket: 'bigmodelsbucket'
    // endpoint: '192.168.99.100',
    // port: 32769
});

//upload('temp.txt');
openOBJ('');

/*
function upload(uri)
{
    client.putFile('temp.txt', 'temp.txt', function(err, res){
        if(!err)
        {
            console.log("Uploaded");
            res.resume();
        }

        else
            console.log(err);
    });
}
*/

function openOBJ(uri)
{
    parseObj(fs.createReadStream("temp.txt"), function(err, object) {
        if(err) {
            throw new Error("Error parsing OBJ file: " + err)
        }
        console.log("Got mesh: ", object.length + ' object');
        /*
        var bounds = {};
        for(var i = 0; i < object.length; i++)
        {

            var verts = object[i].v;
            var minX = verts[0][0];
            var minY = verts[0][1];
            var minZ = verts[0][2];
            var maxX = verts[0][0];
            var maxY = verts[0][1];
            var maxZ = verts[0][2];
            for(var j = 0; j < verts.length; j++)
            {
                if(verts[j][0] < minX) minX = verts[j][0];
                if(verts[j][0] > maxX) maxX = verts[j][0];
                if(verts[j][1] < minY) minY = verts[j][1];
                if(verts[j][1] > maxY) maxY = verts[j][1];
                if(verts[j][2] < minZ) minZ = verts[j][2];
                if(verts[j][2] > maxZ) maxZ = verts[j][2];
            }
            bounds[i] = {min: [minX, minY, minZ], max: [maxX, maxY, maxZ]};
        }
        */
        var objStr = JSON.stringify(object[0]);
        console.log("Uploading to tempUp length("+Buffer.byteLength(objStr)+") : " + objStr);
        var req = client.put("tempPot", {
            'Content-Length': Buffer.byteLength(objStr)
            , 'Content-Type': 'application/json'
        });
        req.on('response', function(res)
        {
            console.log("Uploading object (f-callback)");
            if(res.statusCode == 200) {

                //callback();
                console.log("Success");
            }
            else
            {
                console.log("Error uploading");
            }
        });
        req.end(objStr);
    })
}