// Knockout.js Implementation of ToDos (View Model)

// =================== DOM Ready =============================
$(document).ready(function() {
  // specify lightbox properties
  $('.taskPopup').fancybox({
    maxWidth: 400,
    maxHeight: 600,
    fitToView: false,
    width: '50%',
    height: '70%',
    autoSize: false,
    closeClick: false,
    openEffect: 'elastic',
    closeEffect: 'elastic',
    helpers: {
      title: {
        type: 'outside',
        position: 'top'
      }
    }
  });

  var viewmodel = new TasksViewModel();
  ko.applyBindings(viewmodel);
  viewmodel.populate('daily');
  viewmodel.populate('project');
});

// =================== Functions =============================
function TableRow (counter, priority, entry_type, entry, status) {
  this._id = counter;
  this.rank = priority;
  this.term = entry_type;
  this.entry = ko.observable(entry);
  this.status = ko.observable(status);
  this.selected = ko.observable(false);

  // make entry text editable
  this.edit = function() {
    this.selected(true);
  };
  // update entry from database 
  this.editText = function(data, event) {
    if (event.which === 13) {  // enter key
      this.selected(false);
      $.ajax({
        url: '/textEdit/' + this.entry() + '/' + this._id,
	type: 'PUT',
	success: function(response) {
	  if (response.msg !== null) {
	    console.log('ERROR: ' + response.msg);
	  }
	  else {
	    console.log('UPDATE SUCCESSFUL!');
	  }
        }
      });
    }
  };
}

function TasksViewModel() {
  var self = this,
      counter = {daily: 0, project: 1},  // dailies are even and projects are odd
      priority = {daily: 1, project: 1}, // daily max = 20, project max = 10
      entry = '',
      entries = '',
      newstat = '',
      rank_to_be_removed,
      allowed_rank = 0,
      data = {},
      json_data = {};

  self.ranks = { daily: [], project: [] };
  self.rlimits = { daily: 20, project: 10 };
  self.entry_daily = ko.observable("");
  self.entry_project = ko.observable("");
  self.status = ["incomplete", "completed", "removed"];
  self.table = {
    daily_entries: ko.observableArray(),
    project_entries: ko.observableArray()
  };

  // Populate table
  self.populate = function(type) {
    $.getJSON('/entrylist', function(items) {
      // Return filtered entry objects
      var entrylist = items.filter(function(item) {
          if (item.term === type) {
	    self.ranks[type].push(item.rank);
            return item;
          }
      });

      var sortedlist = entrylist.sort(function(a, b) {
        if (a.rank < b.rank) {
	  return -1;
	}
        if (a.rank > b.rank) {
	  return 1;
	}
        console.log('Rank collision with ' + a.rank + ' and ' + b.rank + '...' + 'Aborting now!');
        
      });
      $.each(sortedlist, function(index, dbentry) {
          var data = new TableRow(dbentry._id, dbentry.rank, dbentry.term, dbentry.entry, dbentry.status);
          self.table[type + '_entries'].push(data); 
          if (dbentry._id >= counter[type]) {
	    counter[type] = dbentry._id + 2;
	  }
      });
    });
  };

  // Add model view data
  self.addCell = function(type, mv, event) {
    if(event.which == 13) {   // enter key
      entry = 'entry_' + type;
      entries = type + '_entries';
     
      // check if rank is already taken 
      for (var i = 1; i <= self.rlimits[type]; i++) {
	if (self.ranks[type].indexOf(i) === -1) {
	  allowed_rank = i;
	  // avoid rank collisions with repeated adds without refresh
	  self.ranks[type].push(i);
	  break;
	}
      }
      if (!allowed_rank) {
	allowed_rank = priority[type]++;
      }

      data = new TableRow(counter[type], allowed_rank, type, mv[entry](), self.status[0]);
      counter[type] = counter[type] + 2;
      self.table[entries].push(data);
      json_data = ko.toJSON(data);  
      $.post('/addentry', json_data, function(response) {
        if (response.msg !== '') {
          console.log('Add Error: ' + response.msg);
        }
      }, 'json');
      mv[entry]('');
    }
  };

  // Add and then slide down markup
  self.addSlideDown = function(elem, index, data) {
    $(elem).find('div').hide().slideDown();
  };

  // Remove model view data
  self.removeCell = function(type, parent, data) {
    entries = type + '_entries';
    // ensure proper ranking with repeated removals without refresh
    rank_to_be_removed = self.ranks[type].indexOf(data.rank);
    // remove rank number from list
    self.ranks[type].splice(rank_to_be_removed, 1);
    // adjust affected ranks
    self.ranks[type].forEach(function(elem, index) {
      if (elem > rank_to_be_removed) {
	elem--;
      }
    });
    self.table[entries].remove(data);
    $.ajax({
      url: '/deleteEntry/' + data._id + '/' + data.rank + '/' + data.term,
      type: 'DELETE',
      success: function(response) {
        if (response.msg !== '') {
          console.log('Delete Error: ' + response.msg);
        }
      }
    });
  };

  // Slide up and remove markup 
  self.removeSlideUp = function(elem, index, data) {
    $(elem).find('div').slideUp(function() { $(elem).remove(); });
  };

  // Toggle completed task 
  self.toggleStatus = function(entry) {
    if(entry.status() === self.status[0]) {
      newstat = self.status[1];
    }
    else {
      newstat = self.status[0];
    }
    entry.status(newstat);

    // adjust experience pts
    adjustExp(entry);

    $.ajax({
      url: '/updateEntry/' + entry._id + '/' + newstat,
      type: 'PUT',
      success: function(response) {
        if(response.msg !== '') {
          console.log('Update Error: ' + response.msg);
        }
      }
    });
  };

  // Sorting entries in a table
  ko.bindingHandlers.sortableTable = {
    init: function(element, valueAccessor, allBindings) {
      $(element).sortable({
        update: function(event, ui) {
          var term = allBindings.get('term');
	  // grab entries from table as observable array
          var entries = valueAccessor();
	  // grab item dragged via DOM node from jQuery array object
          var item_data = ko.dataFor(ui.item[0]);
	  // new position of item dropped
	  var pos = ui.item.parent().children().index(ui.item);
	  // update sorted table
          entries.remove(item_data);
	  entries.splice(pos, 0, item_data);
	  // send the updated table back to the server
          var data = {item: item_data, position: pos, term: term},
	      json_data = JSON.stringify(data);

	  $.post('/addsorted', json_data, function(response) {
	    if(response !== null) {
	      console.log('ERROR post to addsorted: ' + response.msg);
	    }
	  });
	}
      });
    }
  };

  /************************* RANKING FEATURE ******************************/

  // Experience points rewards
  var dailyPts = 50,
      projectPts = 900,
      max = 1000;

  // Ranking Details
  var rankings = [
    'None',
    'Junior 1',
    'Junior 2',
    'Junior 3',
    'Mid-level 1',
    'Mid-level 2',
    'Mid-level 3',
    'Senior 1',
    'Senior 2',
    'Senior 3',
    'Ninja'
  ];

  // Skills Constructors
  function Initializers(skillName, catName) {
    this.category = catName;
    this.skill = skillName;
    this.recent = ko.observable('n/a');
    this.taskList = ko.observable('');
    this.viewRecent = ko.observable(false);
    this.exp = ko.observable(0);
    this.level = ko.observable(0);
    this.ranking = ko.observable(rankings[0]);
    // Fill in recent completed tasks
    this.viewTasks = function(data) {
      this.viewRecent(true);
    };
  }

  // Declare skill sets
  self.basics = ko.observableArray();
  self.buildTools = ko.observableArray();
  self.mvFrames = ko.observableArray();
  self.cssTools = ko.observableArray();
  self.unitTests = ko.observableArray();
  self.skillSets = ko.observableArray([
    self.basics,
    self.buildTools,
    self.mvFrames,
    self.cssTools,
    self.unitTests
  ]);

  /*** ADD SKILLS ***/
  // Basics
  self.basics.push(new Initializers('Javascript', 'Basic Front End'));
  self.basics.push(new Initializers('HTML5', 'Basic Front End'));
  self.basics.push(new Initializers('CSS3', 'Basic Front End'));

  // Build Tools
  self.buildTools.push(new Initializers('Bower', 'Build Tools'));
  self.buildTools.push(new Initializers('Yeoman.io', 'Build Tools'));
  self.buildTools.push(new Initializers('Grunt', 'Build Tools'));
  self.buildTools.push(new Initializers('Gulp', 'Build Tools'));
  self.buildTools.push(new Initializers('Browserify', 'Build Tools'));
  self.buildTools.push(new Initializers('Require.js', 'Build Tools'));

  // MV* Frameworks
  self.mvFrames.push(new Initializers('Knockout.js', 'MV* Frameworks'));
  self.mvFrames.push(new Initializers('Angular.js', 'MV* Frameworks'));
  self.mvFrames.push(new Initializers('Backbone.js', 'MV* Frameworks'));

  // CSS Tools
  self.cssTools.push(new Initializers('SASS', 'CSS Tools'));
  self.cssTools.push(new Initializers('Bootstrap', 'CSS Tools'));
  self.cssTools.push(new Initializers('Responsive Design', 'CSS Tools'));
  
  // Unit Testing
  self.unitTests.push(new Initializers('Jasmine', 'Unit Testing'));
  self.unitTests.push(new Initializers('Karma', 'Unit Testing'));
  /*** END SKILLS ***/

  // Adjust experience points based on completion
  function adjustExp(entry) {
    self.skillSets().forEach(function(types) {
      types().forEach(function(skillset) {
        if (entry.entry().match(new RegExp(skillset.skill, 'i'))) {
          if (entry.status() === self.status[1]) {  // completed
            if (entry.term === 'daily') {
              skillset.exp(skillset.exp() + dailyPts);
            }
            else {
              skillset.exp(skillset.exp() + projectPts);
            }
          }
          else {  // rescind completion
            if (entry.term === 'daily') {
              skillset.exp(skillset.exp() - dailyPts);
            }
            else {
              skillset.exp(skillset.exp() - projectPts);
            }
          }
          modLevel(skillset, entry.term);
          // save previous entries
          prevTasks(entry, skillset);
        }
      });
    });
  }

  // Modify level based on experience points
  function modLevel(elem, term) {
    // level up
    if (elem.exp() >= max) {
      elem.level(elem.level() + 1);
      elem.exp(Math.abs(max - elem.exp()));  // retain overflow points
    }
    // deduct a level and calculate deduction of exp points
    if (elem.exp() < 0) {
      if (term === 'daily') {
        elem.exp(elem.exp() + max);
      }
      else {
        elem.exp(elem.exp() + max);
      }
      elem.level(elem.level() - 1);
    }
    modRanking(elem);
  }

  // Modify ranking based on level
  function modRanking(elem) {
    elem.ranking(rankings[elem.level()]);
  }

  // Save previous entries for later view
  function prevTasks(entry, elem) {
    var tempArray,
        removeIndex;
    if (entry.status() === 'completed') {
      // update view of recent task completed
      elem.recent(entry.entry());
      elem.taskList(elem.taskList() + '<br/>' + entry.entry());
    }
    else {  // incomplete task
      tempArray = elem.taskList().split('<br/>');
      removeIndex = tempArray.indexOf(entry.entry());
      tempArray.splice(removeIndex, 1);
      elem.taskList(tempArray.join('<br/>'));
      if (elem.taskList().length <= 0) {
        elem.recent('n/a');
      }
      else {
        elem.recent(tempArray.slice(-1));
      }
    }
  }
}

