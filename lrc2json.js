var fs = require("fs");
var path = require("path");
//var process = require("process");
var lrcFileList = [];
var badFileList = [];
var lrcDirectoryList = [];
var desDir = "";
var sourceDir = "";
var isWatchDirectory = false;

//判断是否是数组
var isArray = function(obj){
	return Object.prototype.toString.call(obj) === "[object Array]";
}

//判断是否是字符串
var isString = function(obj){
	return Object.prototype.toString.call(obj) === "[object String]";
}

//日志
var logMsg = function(msg){
	//在source 目录
	if(!msg){
		return;
	}
	var logFile = path.join(sourceDir,"/log/log.txt");
	var logPath = path.join(sourceDir,"/log");
	var isExist = fs.existsSync(logPath);
	if(!isExist){
		fs.mkdirSync(logPath);
	}
	var now = new Date();
	msg = now.getTime() + "\n\t" + msg+"\n";
	fs.appendFile(logFile,msg,function(error){
		if(error){
			// send back
			console.log(error.message);
		}
	});
}

//添加到歌词列表中
var addToList = function(lrcPath){
	var extName = path.extname(lrcPath);
	//console.log(extName);
	if(~extName.indexOf("lrc")){
		lrcFileList.push(lrcPath);
	}
}

//只处理文件或者文件夹 如果是文件夹则遍历文件夹里面所有的file找到lrc文件,
//todo: 要遍历内的子目录
var processLrcArg = function(lrcPath){
	var isExist = fs.existsSync(lrcPath);
	if(!isExist){
		console.log("文件路径不存在:"+lrcPath);
		return;
	}
	var state = fs.statSync(lrcPath);
	if(!state){
		console.log("文件路径出错："+lrcPath);
		return;
	}
	if(state.isFile()){
		console.log("文件路径已添加！");
		addToList(lrcPath);
	}
	if(state.isDirectory()){
		var basePath = lrcPath
		sourceDir = lrcPath;
		var lrcAry = fs.readdirSync(lrcPath);
		lrcAry.forEach(function(v,i){
			if(v){
				var real = path.join(basePath,v);
				var realStat =  fs.statSync(real);
				if(realStat.isFile()){
					addToList(real);
				}
				if(realStat.isDirectory()){
					lrcDirectoryList.push(real);
				}
			}
		});
	}
}

var isTickMark = function(tks){
	if(!isArray(tks)){
		return false;
	}
	var isTick = true;
	tks.forEach(function(v,i){
		if(v){
			if(!v.match(/^\s*(\d|\.)+\s*$/ig)){
				isTick = false;
			}
		}else{
			isTick = false;
		}
	});
	return isTick;
}

var getJsonStr = function(tick,cnt,tickLs){
	var tik = "";
	//处理标签
	if(tick){
		var tks = tick.split(":");
		if(!isTickMark(tks)){
			if(!tks[0]){
				return "";
			}
			return '"' + tks[0] + '":"'+ (tks[1] || "" ) + '",';
		}
		//处理可识别时间标签
		switch(tks.length){
			case 1:
				tik = parseFloat(tks[0] || 0)*1000;
				break;
			case 2:
				tik = parseFloat(tks[0] || 0)*60*1000 + parseFloat(tks[1] || 0)*1000;
				break;
			case 3://非标准时间
				tik = parseFloat(tks[0] || 0)*60*1000 + parseFloat(tks[1] || 0)*1000 + parseFloat(tks[2] || 0);
				break;
			default:
				tik = "";
			break;
		};
		tickLs && tickLs.push(tik);
		return '"' + tik + '":"' + cnt +'",';
	}
	return "";
}


var getJson = function(line,tickLs){
	if(!line || !isString(line)){
		return "";
	}
	//var lines = /\[(.+)\](.*)/ig.exec(line);
	//if(!lines || lines.length < 3){
	//	return "";
	//}
	var tick = line.match(/\[([^\]])+\]/ig) || [];
	var cnt = line.match(/\]([^\[\]]+)/) || [];
	if(cnt && cnt.length > 0){
		cnt=cnt[1];
	}else{
		cnt = "";
	}
	var totalStr = "";
	if(!tick || !tick.length){
		return totalStr;
	}
	tick.forEach(function(v,i){
		v = v.match(/[^\[\]]+/ig);
		if(v){
			totalStr += getJsonStr(v[0],cnt,tickLs);
		}
	});
	return totalStr;
}
//写入结束标记，做好收尾工作
var closeJson = function(jsbf,tickList,offset,endChar,endCharLen){
	var tickStr = "";
	if(offset <= endCharLen){
		jsbf.write(endChar,offset,endCharLen,"utf8");
		offset = offset + endCharLen;
	}else{
		tickStr = '"timeList"' + ":[" + tickList.join(",") + "]";
		var tickByteLen = Buffer.byteLength(tickStr);
		jsbf.write(tickStr,offset,tickByteLen,"utf8");
		offset = offset + tickByteLen;
		jsbf.write(endChar,offset,endCharLen,"utf8");
		offset = offset + endCharLen;
	}
	jsbf.length = offset;
	return jsbf;
}

var processLrc = function(lrcPath,dir){
	if(!lrcPath || !fs.existsSync(lrcPath)){
		console.log("lrc文件不存在"+lrcPath);
		return;
	}
	//var fs.
	var beginChar = "{";
	var endChar = "}";
	var splitChar = ",";
	
	var beginCharLen = Buffer.byteLength(beginChar);
	var endCharLen = Buffer.byteLength(endChar);
	var splitCharLen = Buffer.byteLength(splitChar);
	var tickList = [];
	
	
	var lrc = fs.createReadStream(lrcPath);
	var json = fs.createWriteStream(dir);
	var jsbf = new Buffer(100*1000);
	
	var offset = beginCharLen;
	jsbf.write(beginChar,0,beginCharLen,"utf8");
	
	json.on("error",function(e){
		logMsg("转换出错了:"+e.message);
	});
	lrc.on("error",function(e){
		logMsg("转换出错了:"+e.message);
	});
	
	lrc.on("data",function(data){
        var start = 0;
        for(var i=0; i < data.length; i++){
            if(data[i] == 10){ //\n new line
                var line = null;
				if(data[i-1] == 13){
					line = data.slice(start,i-1);
				}else{
					line = data.slice(start,i);
				}
				line = line.toString("utf8");
				var jsonLine = getJson(line,tickList);
				var lineByteLength = Buffer.byteLength(jsonLine,"utf8");
				if(lineByteLength){
					jsbf.write(jsonLine,offset,lineByteLength,"utf8");
					offset+=lineByteLength;
				}
				//console.log(getJson(line) + "!!");
                start = i+1;
            }
        }
        if(start<data.length){
            var lastLine = data.slice(start);
			var jsonLine = getJson(lastLine,tickList);
			var lineByteLength = Buffer.byteLength(jsonLine,"utf8");
			if(lineByteLength){
				jsbf.write(jsonLine,offset,lineByteLength,"utf8");
				offset+=lineByteLength;
			}
        }
		//console.log(data.toString("utf8"));
	});
	lrc.on("end",function(){
		jsbf = closeJson(jsbf,tickList,offset,endChar,endCharLen);
		json.write(jsbf);
		json.on("end",function(){
			logMsg("已经生成了json文件："+dir);
		})
	});
}

var transformFile = function(source){
	var extName = path.extname(source);
	var baseName = path.basename(source,extName);
	var desFile = path.join(desDir,baseName+".json");
	logMsg("开始处理文件:"+source);
	try{
		processLrc(source,desFile);
	}catch(e){
		logMsg("抛出了异常："+e.message);
	}
}

var initApp = function(){
	lrcFileList.forEach(function(v,i){
		transformFile(v);
	});
	if(isWatchDirectory && desDir && sourceDir){
		//开启监视
		logMsg("开始监视目录:"+desDir);
		console.log("正在监视目录："+ sourceDir);
		fs.watch(sourceDir,function(evt,fileName){
			logMsg("源目录检测到事件:"+evt);
			if(evt && fileName){
				//重新编译文件
				var sorce = path.join(sourceDir,fileName);
				transformFile(sorce);
			}
		});
	}
}

// process.argv
process.argv.forEach(function (val, index, array) {
	if(index <= 1){
		return;
	}
	if(index == 2){
		//输出目录
		desDir = val;
		return;
	}
	if(~val.indexOf("-watch")){
		//开启监控模式
		isWatchDirectory = true;
		return;
	}
	processLrcArg(val);
	//lrcFileList.push(val);
});

initApp();




//console.log(lrcFileList);
//processLrc(lrcFileList[0],"f://json//lrc.json");
//console.log("参数处理完成 ！");
