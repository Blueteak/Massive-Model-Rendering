/**
 * Recursively splits a 3D model into parts based on vertex count and bounding box dimensions.
 */
var objParse    = require('objparse'),
    fs          = require('fs');

var splitLimit = 25000;

module.exports = {
    split: split,
    getBounds: getBounds
};

//Main function to call, Split(filename);
function splitObj(uri)
{
    objParse(fs.createReadStream(uri), function(err, object) {
        if(err) {
            throw new Error("Error parsing OBJ file: " + err)
        }
        console.log("Got mesh: ", object.length + ' objects');
        //Create bounding box JSON
        var objList = split(object);
        var bounds = getBounds(objList);
        var v = "mtllib default.mtl\n\n";
        fs.writeFile("./split.obj", v, function(err) {
            if(err) {
                return console.log(err);
            }
            console.log("Created File: Adding Data");
            var vLength = 1;
            for(var k = 0; k < objList.length; k++)
            {
                var val = "";
                var obj = objList[k];
                var tempL = 0;
                for(var l = 0; l<obj.v.length; l++)
                {
                    val += "v " + obj.v[l][0] + " " + obj.v[l][1] + " " + obj.v[l][2] + "\n";
                    tempL++;
                }
                val += "\ng object "+k+"\nusemtl default\n";
                for(var m = 0; m<obj.f.length; m++) {
                    val += "f " + (obj.f[m][0] + vLength) + " " + (obj.f[m][1] + vLength) + " " + (obj.f[m][2] + vLength) + "\n";
                }
                vLength += tempL;
                console.log("Obj "+k+" string created, appending to file");
                fs.appendFileSync('./split.obj', val);
            }
        });
    });
}

//Recursive split function
function split(object)
{
    var didSplit = false;
    for(var i=0; i<object.length; i++)
    {
        if(object[i].v.length > splitLimit)
        {
            didSplit = true;
            var toSplit = object[i];
            object.splice(i, 1);
            var objArr = doSplit(toSplit);
            objArr.forEach(function(obj){
                object.push(obj);
            })
        }
    }
    if(didSplit)
        return split(object);
    else
        return object;
}

//Physical split of object into two parts
function doSplit(obj)
{
    var bound = getBounds([obj])[0];
    dI = getDimension(bound);
    midPt = (bound.max[dI] + bound.min[dI])/2;


    var vUpHash = {};
    var vDnHash = {};
    var fUp = [];
    var fDn = [];

    var vupEdg = [];
    var vdnEdg = [];
    var fupEdg = [];
    var fdnEdg = [];

    var vUp = [];
    var vDn = [];

    //Split verts into > and < midpoint hashes
    for(var i = 0; i < obj.v.length; i++)
    {
        if(obj.v[i][dI] <= midPt)
            vUpHash[i] = {val: obj.v[i], indx: i};
        else
            vDnHash[i] = {val: obj.v[i], indx: i};
    }
    //Add faces to > and < midpT arrays based on # of verts on given side
    //Add remaining verts to vertex hashes
    for(var j = 0; j < obj.f.length; j++)
    {
        var face = obj.f[j];

        var fCt = 0;
        if(vUpHash[face[0]] != undefined)
            fCt++;
        if(vUpHash[face[1]] != undefined)
            fCt++;
        if(vUpHash[face[2]] != undefined)
            fCt++;
        //Add face to array, split cut tri in two
        if(fCt > 2)
        {
            fUp.push(obj.f[j]);
        }
        else if(fCt == 0)
        {
            fDn.push(obj.f[j]);
        }
        else
        {
            var mpt1 = [0,0,0];
            var mpt2 = [0,0,0];
            var p1 = [0,0,0], p2 = [0,0,0], p3 = [0,0,0];

            if(fCt == 2)
            {
                if(vUpHash[face[0]] != undefined && vUpHash[face[1]] != undefined)
                {
                    p1 = vUpHash[face[0]].val; p2 = vUpHash[face[1]].val; p3 = vDnHash[face[2]].val;
                }
                else if(vUpHash[face[1]] != undefined && vUpHash[face[2]] != undefined)
                {
                    p1 = vUpHash[face[1]].val; p2 = vUpHash[face[2]].val; p3 = vDnHash[face[0]].val;
                }
                else
                {
                    p2 = vUpHash[face[0]].val; p1 = vUpHash[face[2]].val; p3 = vDnHash[face[1]].val;
                }
                mpt1 = [(p1[0]+p3[0])/2,(p1[1]+p3[1])/2,(p1[2]+p3[2])/2];
                mpt2 = [(p2[0]+p3[0])/2,(p2[1]+p3[1])/2,(p2[2]+p3[2])/2];
                var Q = vupEdg.length;
                fupEdg.push([Q, Q+1, Q+2]);
                fupEdg.push([Q+1, Q+3, Q+2]);
                vupEdg.push(p1, p2, mpt1, mpt2);
                Q = vdnEdg.length;
                fdnEdg.push([Q, Q+1, Q+2]);
                vdnEdg.push(p3, mpt1, mpt2);
            }
            else
            {
                if(vUpHash[face[0]] != undefined)
                {
                    p3 = vUpHash[face[0]].val; p1 = vDnHash[face[1]].val; p2 = vDnHash[face[2]].val;
                }
                else if(vUpHash[face[1]] != undefined)
                {
                    p3 = vUpHash[face[1]].val; p2 = vDnHash[face[0]].val; p1 = vDnHash[face[2]].val;
                }
                else
                {
                    p3 = vUpHash[face[2]].val; p1 = vDnHash[face[0]].val; p2 = vDnHash[face[1]].val;
                }
                mpt1 = [(p1[0]+p3[0])/2,(p1[1]+p3[1])/2,(p1[2]+p3[2])/2];
                mpt2 = [(p2[0]+p3[0])/2,(p2[1]+p3[1])/2,(p2[2]+p3[2])/2];
                var L = vdnEdg.length;
                fdnEdg.push([L, L+1, L+2]);
                fdnEdg.push([L+1, L+3, L+2]);
                vdnEdg.push(p1, p2, mpt1, mpt2);
                L = vupEdg.length;
                fupEdg.push([L, L+1, L+2]);
                vupEdg.push(p3, mpt1, mpt2);
            }
        }
    }
    //Convert vertex indices and change vertex hashes to arrays
    var upIndx = 0, dnIndx = 0;
    for(var k = 0; k < obj.v.length; k++)
    {
        if(vUpHash[k] != undefined)
        {
            vUpHash[k].indx = upIndx;
            vUp.push(vUpHash[k].val);
            upIndx++;
        }
        if(vDnHash[k] != undefined)
        {
            vDnHash[k].indx = dnIndx;
            vDn.push(vDnHash[k].val);
            dnIndx++;
        }
    }
    //Convert face indices to split indices
    for(var ii = 0; ii < fUp.length; ii++)
    {
        for(var jj = 0; jj < 3; jj++)
        {
            if(vUpHash[fUp[ii][jj]] != undefined)
                fUp[ii][jj] = vUpHash[fUp[ii][jj]].indx;
        }
    }
    for(var iii = 0; iii < fDn.length; iii++)
    {
        for(var jjj = 0; jjj < 3; jjj++)
        {
            if(vDnHash[fDn[iii][jjj]] != undefined)
                fDn[iii][jjj] = vDnHash[fDn[iii][jjj]].indx;
        }
    }

    //Add edge faces with correct indices
    var vUpOff = vUp.length;
    var vDnOff = vDn.length;
    for(var vu = 0; vu < vupEdg.length; vu++)
        vUp.push((vupEdg[vu]));
    for(var vd = 0; vd < vdnEdg.length; vd++)
        vDn.push((vdnEdg[vd]));

    for(var fu = 0; fu < fupEdg.length; fu++)
    {
        fupEdg[fu] = [fupEdg[fu][0]+vUpOff, fupEdg[fu][1]+vUpOff, fupEdg[fu][2]+vUpOff];
        fUp.push((fupEdg[fu]));
    }
    for(var fd = 0; fd < fdnEdg.length; fd++)
    {
        fdnEdg[fd] = [fdnEdg[fd][0]+vDnOff, fdnEdg[fd][1]+vDnOff, fdnEdg[fd][2]+vDnOff];
        fDn.push((fdnEdg[fd]));
    }

    console.log("Vertex Length: " + obj.v.length + " - Split into +: " + vUp.length + " & -:" + vDn.length);

    var obj1 = {v: vUp, f: fUp};
    var obj2 = {v: vDn, f: fDn};
    return [obj1, obj2];
}

//Gets Midpoints of triangle vertices
function midPoint(p1, p2, p3)
{
    var mpt1 = [(p1[0]+p3[0])/2,(p1[1]+p3[1])/2,(p1[2]+p3[2])/2];
    var mpt2 = [(p2[0]+p3[0])/2,(p2[1]+p3[1])/2,(p2[2]+p3[2])/2];
    return [mpt1, mpt2];
}

//Gets bounding box of object
function getBounds(object)
{
    var bounds = [];
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
        bounds.push({min: [minX, minY, minZ], max: [maxX, maxY, maxZ]});
    }
    return bounds;
}

//Gets the dimension (x,y,z) -> (0,1,2) on which to split the object
function getDimension(bound)
{
    if(bound.max[0]-bound.min[0] > bound.max[1] - bound.min[1])
    {
        if(bound.max[0]-bound.min[0] > bound.max[2] - bound.min[2])
        {
            return 0;
        }
        else
        {
            return 2;
        }
    }
    else
    {
        if(bound.max[1]-bound.min[1] > bound.max[2] - bound.min[2])
        {
            return 1;
        }
        else
        {
            return 2;
        }
    }
}