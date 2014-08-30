// Create todos app
var express = require('express');
var app = module.exports = express();

// Set views
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');

// Setup static files path
var path = require('path');
app.use(express.static(path.join(__dirname, '.')));

/************** SET ONLY FOR SUBMODULE FUNCTIONS ***********/
// Load Database
var mongo = require('mongoskin'),
    db = mongo.db('mongodb://localhost:27017/todos', {native_parser:true});

// Middleware - send database to every request
app.use(function(req, res, next) {
  req.db = db;
  next();
});

// Enable parsing of request
app.use(express.bodyParser());

// Set Port
var http = require('http');
app.set('port', process.env.PORT || 3000);
http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

// Home Route
app.get('/', function(req, res) {
  res.render('index', { title: 'To Dos' });
});
/************************** END ****************************/


/* ROUTES */

// Render todos main page
app.get('/todos', function(req, res) {
  res.render('index', { title: 'To Dos' });
});

// Get entry list
app.get('/entrylist', function(req, res) {
  var db = req.db;
  db.collection('entries').find().toArray(function(err, items) {
      res.send(items);
  });
});

// Add entry to list
app.post('/addentry', function(req, res) {
  var db = req.db;
  var json_keys = Object.keys(req.body);
  var parsed_entry = JSON.parse(json_keys[0]);

  db.collection('entries').insert(parsed_entry, function(err, result) {
    if(err === null) {
      res.send({msg: ''});
    }
    else {
      res.send({msg: JSON.stringify(err)});
    }
  });
});

// Add and update sorted table 
app.post('/addsorted', function(req, res) {
  var db = req.db,
      keys = Object.keys(req.body),
      parsed_data = JSON.parse(keys[0]),
      item = parsed_data.item,
      pos = parsed_data.position + 1,
      term = parsed_data.term,
      remainder,
      condition1 = {},
      condition2 = {},
      dir_increment,
      dbitem_rank;

  // Find sorted/dragged entry's initial rank
  db.collection('entries').findOne({ _id : item._id }, function(err, result) {
    dbitem_rank = result ? result.rank : 0;
    if (term === 'daily') {
      remainder = 0;   // even numbered ids
    }
    else if (term === 'project') {
      remainder = 1;   // odd numbered ids
    }
    else {
      console.log('term is not recognized...');
    } 

    if (dbitem_rank < pos) {
      dir_increment = -1;
      condition1['$lte'] = pos;   // +1 for 0 based index
      condition2['$gte'] = dbitem_rank;
    }
    else {
      dir_increment = 1;
      condition1['$lte'] = dbitem_rank;   // +1 for 0 based index
      condition2['$gte'] = pos;
    }
    if (err) {
      res.send('finding document: ' + JSON.stringify(err));
    }
    // Update all items' ranks after sort
    db.collection('entries').update({ $and: [{ _id: { $mod: [ 2, remainder ]}}, { rank : condition1 }, { rank : condition2 }]}, { $inc: { rank: dir_increment  }}, { multi : true }, function(err, result) {
      if (err) {
	res.send('ERROR updating all ranks: ' + JSON.stringify(err));
      }
      // Update sorted/dragged entry's final rank
      db.collection('entries').update({ _id : item._id }, { $set: { rank: pos } }, function(err, result) {
	if (err) {
	  res.send('updating dragged item rank: ' + JSON.stringify(err));
	}
      });
    });
  });
});

// Remove entry from list
app.delete('/deleteEntry/:id/:rank/:term', function(req, res) {
    var db = req.db,
        entry_id = JSON.parse(req.params.id),
        entry_rank = JSON.parse(req.params.rank),
        entry_term = req.params.term,
        remainder;

    if (entry_term === 'daily') {
      remainder = 0;   // even numbered ids
    }
    else if (entry_term === 'project') {
      remainder = 1;   // odd numbered ids
    }
    else {
      console.log('term is not recognized...');
    } 


    db.collection('entries').remove({_id: entry_id}, function(err, nresult) {
      if(nresult !== 1) {
        res.send({msg: JSON.stringify(err)});
      }
      else {
	// adjust ranks of lowered ranked entries
	db.collection('entries').update({ $and: [{ _id: { $mod: [ 2, remainder ]}}, { rank: { $gt: entry_rank }}]}, { $inc: { rank: -1 }}, { multi: true }, function(err, result) {
	  if (err) {
	    res.send({ msg: JSON.stringify(err) });
	  }
	  else {
            res.send({msg: ''});
	  }
	});
      }
    });
});

// Update state of entry
app.put('/updateEntry/:id/:stat', function(req, res) {
  var db = req.db,
      entry_id = JSON.parse(req.params.id),
      new_status = req.params.stat;

  db.collection('entries').updateById(
    entry_id,
    {
      $set: { status: new_status }
    },
    function(err, result) {
      if(err === null) {
	res.send({ msg: '' });
      }
      else {
	res.send({ msg: err });
      }
    }
  );
}); 

// Update the entry's text
app.put('/textEdit/:text/:id', function(req, res) {
  var db = req.db,
      value = req.params.text,
      identity = JSON.parse(req.params.id);

  console.log("text is " + value + ' and id is ' + identity);
  db.collection('entries').updateById(
    identity,
    { 
      $set: { entry: value } 
    },  
    function(err, result) {
      if (err) {
	res.send({msg: JSON.stringify(err)});
      }
      else {
	res.send({msg: null});
      }
    }  
  );
});
