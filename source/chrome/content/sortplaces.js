/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the SortPlaces extension.
 *
 * The Initial Developer of the Original Code is Andy Halford.
 * Portions created by the Initial Developer are Copyright (C) 2008-2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var SortPlaces = {
	prefs: Components.classes["@mozilla.org/preferences-service;1"]
									 .getService(Components.interfaces.nsIPrefService)
									 .getBranch("extensions.sortplaces."),
	defaults: Components.classes["@mozilla.org/preferences-service;1"]
										  .getService(Components.interfaces.nsIPrefService)
									 		.getDefaultBranch("extensions.sortplaces."),
	firefoxID: "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}",
	seamonkeyID: "{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}",

	//Hide/show icons/buttons
	init: function() {
		//Vain attempt to stop new windows calling this more than once
		window.removeEventListener("load", SortPlaces.init, false);

		//Initialise as per the recommendations
		var prefs = Components.classes["@mozilla.org/preferences-service;1"]
													.getService(Components.interfaces.nsIPrefService)
													.getBranch("extensions.sortplaces.");

		//Add to add-on bar (or nav bar for older browsers) with first install
		var firstrun = prefs.getBoolPref('firstrun');
		if (firstrun) {
			prefs.setBoolPref('firstrun', false);
			var myId = "sortplaces-button";
			var bar = document.getElementById("addon-bar");
			if (bar) {
				if (!document.getElementById(myId)) {
					bar.insertItem(myId);
					bar.collapsed = false;	//Show the addon bar if it is hidden
						
					//Remember these changes
					bar.setAttribute("currentset", bar.currentSet);  
					document.persist(bar.id, "currentset");
					document.persist(bar.id, "collapsed");
				}
			}

			//Use nav-bar instead for older browsers
			else {
				var bar = document.getElementById("nav-bar");
				var curSet = bar.currentSet.split(",");

				if (curSet.indexOf(myId) == -1) {
					var pos = curSet.indexOf("search-container") + 1 || curSet.length;
					var set = curSet.slice(0, pos).concat(myId).concat(curSet.slice(pos));

					bar.setAttribute("currentset", set.join(","));
					bar.currentSet = set.join(",");
					document.persist(bar.id, "currentset");
					try {
						BrowserToolboxCustomizeDone(true);
					} catch (e) {}
				}
			}
		}

		//Bookmarks menu
		var bmMenu = document.getElementById("sortplaces-bmenu");
		if (bmMenu) bmMenu.hidden = !prefs.getBoolPref("bookmarks_menu");
		var apMenu = document.getElementById("sortplaces-amenu");
		if (apMenu) apMenu.hidden = !prefs.getBoolPref("bookmarks_menu");

		//Tools menu
		var toolsMenu = document.getElementById("sortplaces-tmenu");
		if (toolsMenu) toolsMenu.hidden = !prefs.getBoolPref("tools_menu");

		//Bookmarks organiser
		var orgMenu = document.getElementById("sortplaces-orgmenu");
		if (orgMenu) orgMenu.hidden = !prefs.getBoolPref("org_menu");

		//Manage Bookmarks Tool menu for SeaMonkey)
		var manageMenu = document.getElementById("sortplaces-managemenu");
		if (manageMenu) manageMenu.hidden = !prefs.getBoolPref("manage_menu");

		//Listen for bookmark changes
		PlacesUtils.bookmarks.addObserver(SortPlacesListener, false);
	},

	//Sort from menu
	windowSort: function() {
		window.openDialog('chrome://sortplaces/content/sorting.xul', '_blank', 'chrome,resizable,centerscreen', null);
	},

	// When the dialog is first displayed initialise it
	onDialogLoad: function() {
		this.loadFromPrefs();
		this.toggleIncludeFolders();
		this.toggleExcludeFolders();
		this.toggleSortOptions();
		this.toggleSortFolders();
	},

	//When the OK button is pressed, save all the settings
	onDialogAccept: function() {
		this.savePrefs(true);

		//Statusbar and menu icons
		//Get a list of all open windows
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
											 .getService(Components.interfaces.nsIWindowMediator);
		var enumerator = wm.getEnumerator('navigator:browser');

		//Now hide/show on each window
		while(enumerator.hasMoreElements()) {
			var currentWindow = enumerator.getNext();

			//Turn things on/off as appropriate
			try {
				var bmMenu = document.getElementById("bookmarks_menu").checked;
				currentWindow.document.getElementById("sortplaces-bmenu").hidden = !bmMenu;
		  } catch (exception) {}
			try {
				var bmMenu = document.getElementById("bookmarks_menu").checked;
				currentWindow.document.getElementById("sortplaces-amenu").hidden = !bmMenu;
		  } catch (exception) {}
			try {
				var toolsMenu = document.getElementById("tools_menu").checked;
				currentWindow.document.getElementById("sortplaces-tmenu").hidden = !toolsMenu;
		  } catch (exception) {}
		}

		//Bookmarks Organiser menu
		var enumerator = wm.getEnumerator('Places:Organizer');
		while(enumerator.hasMoreElements()) {
			var currentWindow = enumerator.getNext();
			try {
				var orgMenu = document.getElementById("org_menu").checked;
				currentWindow.document.getElementById("sortplaces-orgmenu").hidden = !orgMenu;
		  } catch (exception) {}
		}

		return true;
	},

	//When the Cancel button is pressed forget everything
	onDialogCancel: function() {
		return true;
	},

	//Set all options to stored preference or default if none
	loadFromPrefs: function() {
		//Iterate over the defaults setting each UI item to the pref
		var prefList = this.defaults.getChildList("", {});
		for (var i = 0 ; i < prefList.length ; i++) {
			switch (this.defaults.getPrefType(prefList[i])) {
				case this.defaults.PREF_BOOL:
					//Deal with outdated prefs (check for null)
					var id = prefList[i];
					var checkbox = document.getElementById(id);
					if (checkbox != null) checkbox.checked = this.prefs.getBoolPref(id);
				break;

				case this.defaults.PREF_STRING:
					var item = document.getElementById(prefList[i]);
					if (item == null) break;
					item.value = this.prefs.getCharPref(prefList[i]);
				break;
			}
		}

		//SeaMonkey/Firefox specific preferences
		var id = this.firefoxID;
		try {
			var info = Components.classes["@mozilla.org/xre/app-info;1"]
													 .getService(Components.interfaces.nsIXULAppInfo);
			id = info.ID;
		} catch(e) {
		}
		document.getElementById('org_menu').hidden = (id == this.seamonkeyID);
		document.getElementById('manage_menu').hidden = (id != this.seamonkeyID);

		//Migrate old settings (reverse them)
		try {
			document.getElementById("include").checked = !this.prefs.getBoolPref("include_all");
			document.getElementById("exclude").checked = !this.prefs.getBoolPref("exclude_none");
			this.prefs.clearUserPref("include_all");
			this.prefs.clearUserPref("exclude_none");
		} catch (e) {
		}
	},

	//Save the preferences
	savePrefs: function() {
		//Iterate over each item (use the defaults list) saving the value
		var prefList = this.defaults.getChildList("", {});
		for (var i = 0 ; i < prefList.length ; i++) {
			switch (this.defaults.getPrefType(prefList[i])) {
				case this.defaults.PREF_BOOL:
					//Deal with outdated prefs (check for null)
					var checkbox = document.getElementById(prefList[i]);
					if (checkbox != null) this.prefs.setBoolPref(prefList[i], checkbox.checked);
				break;

				case this.defaults.PREF_STRING:
					var item = document.getElementById(prefList[i]);
					if (item == null) break;
					this.prefs.setCharPref(prefList[i], item.value);
				break;
			}
		}
	},

	//Save auto sort preference
	saveAutoSort: function() {
		var autosort = document.getElementById("autosort").checked;
		this.prefs.setBoolPref("autosort", autosort);
		document.getElementById("delay").disabled = !autosort;

		//Immediately sort to catch up with any changes
		if (autosort) SortPlacesSort.sortBookmarks(false);
	},

	toggleSortOptions: function() {
		function sortToggle(type) {
			for (var i=0; i<3; i++ ) {
				var sortType = document.getElementById("sort_by_" + type + i).value;
				var sortByName = (sortType == "sort_name_" + type + i) || (sortType == "sort_description_" + type + i) ;
				if (!sortByName) document.getElementById("case_insensitive_" + type + i).checked = false;
				document.getElementById("case_insensitive_" + type + i).disabled = !sortByName;
			}
		}

		//START HERE
		sortToggle("m");
		sortToggle("t");
		sortToggle("u");
	},

	//Show/hide the folder sort by tabs as appropriate
	toggleSortFolders: function() {
		var sortFolders = document.getElementById("sort_folders").checked;
		document.getElementById("SortFolderMenu").collapsed = !sortFolders;
		document.getElementById("SortFolderToolbar").collapsed = !sortFolders;
		document.getElementById("SortFolderUnfiled").collapsed = !sortFolders;

		//Prevent display issues by forcing the selection of the first tab
		document.getElementById("menuTabs").selectedItem = document.getElementById("SortMenu");
		document.getElementById("toolbarTabs").selectedItem = document.getElementById("SortToolbar");
		document.getElementById("unfiledTabs").selectedItem = document.getElementById("SortUnfiled");
	},

	//Display the button depending on the include checkbox
	toggleIncludeFolders: function() {
		document.getElementById("include_folders").disabled = !document.getElementById("include").checked;
	},

	//Display the button depending on the exclude checkbox
	toggleExcludeFolders: function() {
		document.getElementById("exclude_folders").disabled = !document.getElementById("exclude").checked;
	},

	//Select which folder to sort
	selectBookmarkFolder: function(include) {
		var params = {inn:{include:include}, out:null};
		window.openDialog('chrome://sortplaces/content/folders.xul', 'SortPlacesFolders', 'chrome,resizable,modal,centerscreen', params);

		//If nothing selected then tick the box to say everything will be included/none_excluded as appropriate
		var currentIDs = this.prefs.getCharPref(include ? "include_folder_ids" : "exclude_folder_ids");
		if (!currentIDs || !currentIDs.length) {
			document.getElementById(include ? "include" : "exclude").checked = true;
			this.toggleIncludeFolders();
			this.toggleExcludeFolders();
		}
	},

	showOptions: function() {
		window.openDialog('chrome://sortplaces/content/options.xul', 'SortPlaces', 'chrome,centerscreen');
	},

	//Left/Rt Mouse click events
	handleEvent: function(event) {
		//Left mouse click does the sort
		//Right Mouse (Mac: command+click)  shows the options
		if (event.button == 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
			this.windowSort();
		}

		//Right or Middle or Other mouse click displays the options
		//Also left mouse click with meta,alt,shift or ctrl
		else {
			this.showOptions();
		}

		//Stop event bubbling up
		event.preventDefault();
	}
};

//Hide/Show the icons/buttons
window.addEventListener("load", SortPlaces.init, false);

//For auto-sorting
var SortPlacesListener = {
	prefs: Components.classes["@mozilla.org/preferences-service;1"]
									 .getService(Components.interfaces.nsIPrefService)
									 .getBranch("extensions.sortplaces."),
	ignore: false,
	timer: null,

	//Ignore events generated during batch processing
	//eg When SortPlaces itself does some sorting
  onBeginUpdateBatch: function() {
		this.ignore = true;
	},

  onEndUpdateBatch: function() {
		this.ignore = false;
	},

	//Just here to stop Firefox 3.6 whining
	onBeforeItemRemoved: function(aItemId, aItemType) {
	},

	//If it's a new folder then ignore it
	//Cancel any existing timer as well
  onItemAdded: function(aItemId, aFolder, aIndex) {
		try {
			if ((PlacesUtils.bookmarks.getItemType(aItemId) ==
							PlacesUtils.bookmarks.TYPE_FOLDER) &&
					!PlacesUtils.livemarks.isLivemark(aItemId))
			{
				if (this.timer) this.timer.cancel();
			}
			else {
				this.startTimer();
			}
		} catch (e) {
		}
	},

	//Nothing to do when something deleted unless it's a separator
  onItemRemoved: function(aItemId, aFolder, aIndex) {
		try {
			if (PlacesUtils.bookmarks.getItemType(aItemId) ==
							PlacesUtils.bookmarks.TYPE_SEPARATOR)
			{
				this.startTimer();
			}
			} catch (e) {
		}
	},

  onItemChanged: function(aBookmarkId, aProperty, aIsAnnotationProperty, aValue) {
		this.startTimer();
  },

  onItemVisited: function(aBookmarkId, aVisitID, time) {
		this.startTimer();
	},

  onItemMoved: function(aItemId, aOldParent, aOldIndex, aNewParent, aNewIndex) {
		this.startTimer();
	},

	//Wait before sorting in case any other events happen
	startTimer: function() {
		//cancel any existing timer
		if (this.timer) this.timer.cancel();

		//Create a timer to set off an auto-sort
		if (this.prefs.getBoolPref("autosort") && !this.ignore) {
			try {
				this.timer = Components.classes["@mozilla.org/timer;1"]
															 .createInstance(Components.interfaces.nsITimer);
				this.timer.init(this, this.prefs.getCharPref("delay") * 1000,
												Components.interfaces.nsITimer.TYPE_ONE_SHOT);
			} catch(e) {
			}
		}
	},

  observe: function(subject, topic, data) {
  	if (topic == "timer-callback" && subject == this.timer && !this.ignore) {
			try {
				 if (this.noSPDialogs()) {
					 SortPlacesSort.sortBookmarks(false);
				 }
			} catch(e) {
			}
  	}
	},

	noSPDialogs: function() {
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
								 			 .getService(Components.interfaces.nsIWindowMediator);
		var enumerator = wm.getEnumerator("SortPlacesType");
		return !enumerator.hasMoreElements();
	},

  QueryInterface: function(iid) {
    if (iid.equals(Components.interfaces.nsIObserver) ||
    		iid.equals(Components.interfaces.nsINavBookmarkObserver) ||
    		iid.equals(Components.interfaces.nsISupports)) {
      return this;
    }
    throw Components.results.NS_ERROR_NO_INTERFACE;
  }
};

