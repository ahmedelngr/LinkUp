/* LinkUp — Apple Maps (MapKit JS) with Leaflet fallback, social feed, tabs, monetization */
(function(){
  const hasFirebase =
    typeof firebase !== "undefined" &&
    firebase.apps && firebase.apps.length > 0 &&
    typeof window.db !== "undefined" &&
    typeof window.auth !== "undefined";

  // Detect Apple Maps availability (token + script loaded)
  const hasAppleMaps = typeof mapkit !== "undefined" && !!(window.APPLE_MAPS_JWT);

  // DOM refs (same as before)
  const tabButtons = [...document.querySelectorAll(".tabbtn")];
  const tabs = {
    home: byId("tab-home"), create: byId("tab-create"), map: byId("tab-map"),
    friends: byId("tab-friends"), profile: byId("tab-profile")
  };
  const eventsList = byId("eventsList");
  const emptyFeed = byId("emptyFeed");
  const searchInput = byId("searchInput");
  const dateFilter = byId("dateFilter");
  const sortBy = byId("sortBy");
  const form = byId("createEventForm");
  const signInBtn = byId("signInBtn");
  const signOutBtn = byId("signOutBtn");
  const displayName = byId("displayName");
  const avatar = byId("avatar");
  const quickCreate = byId("quickCreate");
  const useMyLocation = byId("useMyLocation");
  const addFriendForm = byId("addFriendForm");
  const friendsList = byId("friendsList");
  const clearLocalBtn = byId("clearLocal");
  const profileInfo = byId("profileInfo");
  const statMyEvents = byId("statMyEvents");
  const statRsvp = byId("statRsvp");
  const statEarnings = byId("statEarnings");
  const myEventsList = byId("myEventsList");
  const shareDialog = byId("shareDialog");
  const shareUrl = byId("shareUrl");
  const copyShare = byId("copyShare");
  const closeShare = byId("closeShare");
  const monetizeDialog = byId("monetizeDialog");
  const howToMonetize = byId("howToMonetize");
  const closeMonetize = byId("closeMonetize");

  // Tabs
  tabButtons.forEach(btn=>{
    btn.onclick = () => {
      tabButtons.forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const id = btn.dataset.tab;
      for (const k in tabs) tabs[k].classList.toggle("active", k === id);
      if (id === "map") setTimeout(refreshMap, 40);
      if (id === "profile") refreshProfile();
    };
  });

  // Auth (optional)
  if (hasFirebase) {
    signInBtn.onclick = async () => {
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithRedirect(provider);
      } catch (e) { alert(`Sign-in failed: ${e.code||e.message}`); }
    };
    signOutBtn.onclick = async () => { try { await auth.signOut(); } catch (e) {} };

    auth.onAuthStateChanged((user)=>{
      const signedIn = !!user;
      toggle(signInBtn, !signedIn);
      toggle(signOutBtn, signedIn);
      toggle(displayName, signedIn);
      toggle(avatar, signedIn);
      profileInfo.textContent = signedIn ? `Signed in as ${user.displayName||"User"}` : "Not signed in";
      if (signedIn && user.photoURL) avatar.src = user.photoURL;
      refresh();
    });
  } else {
    toggle(signInBtn,false); toggle(signOutBtn,false); toggle(displayName,false); toggle(avatar,false);
    profileInfo.textContent = "Demo Mode (no sign-in)";
  }

  // Quick create
  quickCreate.onclick = () => {
    document.querySelector('.tabbtn[data-tab="create"]').click();
    byId("eventTitle").focus();
  };

  // Create Event
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = v("eventTitle");
    const date = v("eventDate");
    const time = v("eventTime");
    const locationText = v("eventLocation");
    const description = v("eventDescription");
    const price = toNum(v("price"));
    const ticketUrl = v("ticketUrl").trim();
    const coverUrl = v("coverUrl").trim();
    const lat = toNum(v("lat"));
    const lng = toNum(v("lng"));

    if (!title || !date || !time) return alert("Please provide title, date and time.");
    const when = new Date(`${date}T${time}`);
    if (Number.isNaN(when.getTime())) return alert("Invalid date/time.");

    const payload = {
      id: `local_${Date.now()}`,
      title, description, locationText, price, ticketUrl, coverUrl,
      dateTimeISO: when.toISOString(),
      ...(isFinite(lat) && isFinite(lng) ? {lat, lng} : {}),
      likes: 0, rsvps: 0
    };

    if (hasFirebase) {
      try {
        await db.collection("events").add({
          title: payload.title,
          description: payload.description,
          locationText: payload.locationText,
          price: payload.price,
          ticketUrl: payload.ticketUrl,
          coverUrl: payload.coverUrl,
          dateTime: firebase.firestore.Timestamp.fromDate(when),
          lat: payload.lat ?? null, lng: payload.lng ?? null,
          likes: 0, rsvps: 0,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (err) {
        console.warn("Firestore write failed → storing locally:", err);
        saveLocalEvent(payload);
      }
    } else {
      saveLocalEvent(payload);
    }

    form.reset();
    document.querySelector('.tabbtn[data-tab="home"]').click();
    refresh();
  });

  // Geolocate
  useMyLocation.onclick = () => {
    if (!navigator.geolocation) return alert("Geolocation not supported.");
    navigator.geolocation.getCurrentPosition(
      (pos)=>{
        byId("lat").value = pos.coords.latitude.toFixed(6);
        byId("lng").value = pos.coords.longitude.toFixed(6);
        document.querySelector('.tabbtn[data-tab="map"]').click();
      },
      (err)=> alert("Location error: " + err.message),
      { enableHighAccuracy:true, timeout:10000 }
    );
  };

  // Filters
  searchInput.oninput = refresh;
  dateFilter.onchange = refresh;
  sortBy.onchange = refresh;

  // Friends
  addFriendForm.addEventListener("submit",(e)=>{
    e.preventDefault();
    const handle = v("friendHandle");
    if (!handle.startsWith("@")) return alert("Handle should start with @ (e.g., @ahmed)");
    const list = getLocal("friends");
    if (list.find(x=>x.handle.toLowerCase()===handle.toLowerCase())) return alert("Already added.");
    list.push({handle, addedAt: Date.now()});
    setLocal("friends", list);
    addFriendForm.reset();
    renderFriends();
  });

  // Profile actions
  clearLocalBtn.onclick = ()=>{
    localStorage.removeItem("linkup_events");
    localStorage.removeItem("linkup_friends");
    localStorage.removeItem("linkup_likes");
    localStorage.removeItem("linkup_rsvps");
    refresh(); renderFriends(); refreshMap(); refreshProfile();
  };
  howToMonetize.onclick = ()=> monetizeDialog.showModal();
  closeMonetize.onclick = ()=> monetizeDialog.close();

  // Share modal
  copyShare.onclick = async ()=>{
    try { await navigator.clipboard.writeText(shareUrl.value); copyShare.textContent = "Copied!"; setTimeout(()=>copyShare.textContent="Copy link",1200); }
    catch { alert("Copy failed. Manually copy the URL."); }
  };
  closeShare.onclick = ()=> shareDialog.close();

  // Initial render
  refresh(); renderFriends(); initMap();

  // ====== FEED ======
  function refresh(){
    const pull = async () => {
      if (hasFirebase) {
        try {
          const snap = await db.collection("events").orderBy("dateTime","asc").limit(300).get();
          return snap.docs.map(d => ({
            id: d.id,
            title: d.data().title || "",
            description: d.data().description || "",
            locationText: d.data().locationText || "",
            price: d.data().price || 0,
            ticketUrl: d.data().ticketUrl || "",
            coverUrl: d.data().coverUrl || "",
            dateTimeISO: d.data().dateTime?.toDate ? d.data().dateTime.toDate().toISOString() : new Date().toISOString(),
            lat: d.data().lat ?? null, lng: d.data().lng ?? null,
            likes: d.data().likes || 0, rsvps: d.data().rsvps || 0
          }));
        } catch (e) {
          console.warn("Read failed, using local", e);
          return getLocal("events");
        }
      } else {
        return getLocal("events");
      }
    };

    pull().then(items=>{
      const q = searchInput.value.trim().toLowerCase();
      const whenRange = dateFilter.value;
      const now = new Date();

      let list = items.filter(ev=>{
        if (q && !(ev.title?.toLowerCase().includes(q) || ev.locationText?.toLowerCase().includes(q))) return false;
        if (whenRange === "today") {
          return new Date(ev.dateTimeISO).toDateString() === now.toDateString();
        }
        if (whenRange === "week") {
          const d = new Date(ev.dateTimeISO); const diff = (d - startOfDay(now))/86400000;
          return diff >= 0 && diff <= 7;
        }
        return true;
      });

      if (sortBy.value === "hot") {
        const likes = getLocal("likes"); const rsvps = getLocal("rsvps");
        list.sort((a,b)=> (b.likes + (rsvps[b.id]||0)) - (a.likes + (rsvps[a.id]||0)));
      } else if (sortBy.value === "new") {
        list.sort((a,b)=> new Date(b.dateTimeISO) - new Date(a.dateTimeISO));
      } else {
        list.sort((a,b)=> new Date(a.dateTimeISO) - new Date(b.dateTimeISO));
      }

      renderFeed(list);
      refreshMap(list);
      refreshProfile(list);
    });
  }

  function renderFeed(items){
    eventsList.innerHTML = "";
    emptyFeed.classList.toggle("hide", items.length !== 0);
    const likes = getLocal("likes"); const rsvps = getLocal("rsvps");

    for (const ev of items) {
      const when = new Date(ev.dateTimeISO);
      const whenText = `${when.toLocaleDateString()} • ${when.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}`;
      const li = document.createElement("li");
      li.className = "card-event";
      const bg = ev.coverUrl ? `url('${ev.coverUrl}')` : `linear-gradient(135deg, rgba(91,140,255,.25), rgba(124,91,255,.25))`;
      const pricePill = Number(ev.price) > 0 ? `<div class="price-pill">$${Number(ev.price).toFixed(2)}</div>` : "";

      // Apple Maps deep link
      const appleLink = (Number.isFinite(ev.lat) && Number.isFinite(ev.lng))
        ? `https://maps.apple.com/?ll=${ev.lat},${ev.lng}&q=${encodeURIComponent(ev.title)}`
        : "";

      li.innerHTML = `
        <div class="cover" style="background-image:${bg}">${pricePill}</div>
        <div class="card-body">
          <div class="rowline">
            <strong>${esc(ev.title)}</strong>
            ${Number(ev.price)>0 ? `<span class="chip">Paid</span>` : `<span class="chip">Free</span>`}
          </div>
          <div class="rowline"><span class="chip">${whenText}</span><span class="chip">${esc(ev.locationText || "TBA")}</span></div>
          ${ev.description ? `<div class="muted">${esc(ev.description)}</div>` : ""}
          <div class="actions">
            <button class="btn" data-like="${ev.id}">❤️ Like</button>
            <span class="counter" id="likeCount_${ev.id}">${(ev.likes||0)+(likes[ev.id]||0)}</span>
            <button class="btn" data-rsvp="${ev.id}">✅ RSVP</button>
            <span class="counter" id="rsvpCount_${ev.id}">${rsvps[ev.id]||0}</span>
            ${ev.ticketUrl ? `<a class="btn btn-primary" href="${ev.ticketUrl}" target="_blank">Buy Ticket${Number(ev.price)?` — $${Number(ev.price).toFixed(2)}`:""}</a>` : ""}
            <button class="btn" data-share="${ev.id}">🔗 Share</button>
            ${appleLink ? `<a class="btn" href="${appleLink}" target="_blank"> Maps</a>` : ""}
            ${Number.isFinite(ev.lat) && Number.isFinite(ev.lng) ? `<button class="btn" data-goto="${ev.lat},${ev.lng}">🗺️ In-app</button>` : ""}
          </div>
        </div>
      `;
      eventsList.appendChild(li);
    }

    eventsList.querySelectorAll("[data-like]").forEach(btn=>{
      const likes = getLocal("likes");
      btn.onclick = ()=>{ likes[btn.dataset.like]=(likes[btn.dataset.like]||0)+1; setLocal("likes", likes); byId(`likeCount_${btn.dataset.like}`).textContent = likes[btn.dataset.like]; };
    });
    eventsList.querySelectorAll("[data-rsvp]").forEach(btn=>{
      const rsvps = getLocal("rsvps");
      btn.onclick = ()=>{ rsvps[btn.dataset.rsvp]=(rsvps[btn.dataset.rsvp]||0)+1; setLocal("rsvps", rsvps); byId(`rsvpCount_${btn.dataset.rsvp}`).textContent = rsvps[btn.dataset.rsvp]; refreshProfile(); };
    });
    eventsList.querySelectorAll("[data-share]").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.dataset.share;
        const url = location.href.split("#")[0] + `#event-${id}`;
        shareUrl.value = url; shareDialog.showModal();
      };
    });
    eventsList.querySelectorAll("[data-goto]").forEach(btn=>{
      btn.onclick = ()=>{
        const [lat,lng] = btn.dataset.goto.split(",").map(Number);
        document.querySelector('.tabbtn[data-tab="map"]').click();
        setTimeout(()=> focusOn(lat,lng), 80);
      };
    });
  }

  // ====== FRIENDS ======
  function renderFriends(){
    const list = getLocal("friends");
    friendsList.innerHTML = "";
    list.forEach((f,i)=>{
      const li = document.createElement("li");
      li.className = "card";
      li.innerHTML = `
        <div class="rowline">
          <div class="bubble" style="width:36px;height:36px"><span style="opacity:.8">${esc(f.handle[1]||'U').toUpperCase()}</span></div>
          <strong>${esc(f.handle)}</strong>
          <span class="muted">• since ${new Date(f.addedAt).toLocaleDateString()}</span>
          <span style="flex:1"></span>
          <button class="btn" data-remove="${i}">Remove</button>
        </div>`;
      friendsList.appendChild(li);
    });
    friendsList.querySelectorAll("[data-remove]").forEach(btn=>{
      btn.onclick = ()=>{
        const idx = Number(btn.dataset.remove);
        const list = getLocal("friends");
        list.splice(idx,1);
        setLocal("friends", list);
        renderFriends();
      };
    });
  }

  // ====== PROFILE ======
  function refreshProfile(list){
    list = list || getLocal("events");
    const r = getLocal("rsvps");
    const totalRsvp = Object.values(r).reduce((a,b)=>a+b,0);
    const myEvents = list.length;
    const est = list.reduce((sum,ev)=> sum + (Number(ev.price||0) * (r[ev.id]||0)), 0);
    statMyEvents.textContent = myEvents;
    statRsvp.textContent = totalRsvp;
    statEarnings.textContent = `$${est.toFixed(2)}`;

    myEventsList.innerHTML = "";
    list.slice().sort((a,b)=> new Date(b.dateTimeISO) - new Date(a.dateTimeISO)).forEach(ev=>{
      const li = document.createElement("li");
      li.className = "card";
      li.innerHTML = `
        <div class="rowline">
          <strong>${esc(ev.title)}</strong>
          <span class="muted">${new Date(ev.dateTimeISO).toLocaleString()}</span>
          <span style="flex:1"></span>
          <button class="btn btn-danger" data-del="${ev.id}">Delete</button>
        </div>`;
      myEventsList.appendChild(li);
    });
    myEventsList.querySelectorAll("[data-del]").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.dataset.del;
        const list = getLocal("events").filter(x=>x.id !== id);
        setLocal("events", list);
        refresh(); refreshProfile(list);
      };
    });
  }

  // ====== MAPS ======
  let mapProvider = hasAppleMaps ? "apple" : "leaflet";
  let leaflet, mkMap, mkAnnotations = [], leafletMap, leafletLayer;

  function initMap(){
    if (mapProvider === "apple") {
      try {
        mapkit.init({
          authorizationCallback: function(done){ done(window.APPLE_MAPS_JWT); }
        });
        mkMap = new mapkit.Map("map");
        // Default LA region
        const center = new mapkit.Coordinate(34.05,-118.24);
        mkMap.region = new mapkit.CoordinateRegion(center, new mapkit.CoordinateSpan(0.35, 0.35));
      } catch (e) {
        console.warn("Apple MapKit init failed → falling back to Leaflet:", e);
        mapProvider = "leaflet";
      }
    }
    if (mapProvider === "leaflet") {
      leafletMap = L.map('map', { zoomControl:true }).setView([34.05,-118.24], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'© OpenStreetMap' }).addTo(leafletMap);
      leafletLayer = L.layerGroup().addTo(leafletMap);
    }
  }

  function refreshMap(items){
    items = items || getLocal("events");
    if (mapProvider === "apple" && mkMap) {
      // clear old
      if (mkAnnotations.length) mkMap.removeAnnotations(mkAnnotations), mkAnnotations = [];
      const coords = [];
      for (const ev of items) {
        if (!isFinite(ev.lat) || !isFinite(ev.lng)) continue;
        const coord = new mapkit.Coordinate(ev.lat, ev.lng);
        const ann = new mapkit.MarkerAnnotation(coord, {
          title: ev.title,
          subtitle: ev.locationText || "",
          color: "#5b8cff",
          glyphText: "★"
        });
        mkAnnotations.push(ann);
        coords.push(coord);
      }
      if (mkAnnotations.length) {
        mkMap.addAnnotations(mkAnnotations);
        try {
          mkMap.showItems(mkAnnotations, { animate:true, padding: new mapkit.Padding(30,30,30,30) });
        } catch {}
      }
      return;
    }

    if (mapProvider === "leaflet" && leafletMap) {
      leafletLayer.clearLayers();
      const pts = [];
      for (const ev of items) {
        if (!isFinite(ev.lat) || !isFinite(ev.lng)) continue;
        const popup = `<strong>${esc(ev.title)}</strong><br>${esc(ev.locationText||"")}`;
        L.marker([ev.lat, ev.lng]).bindPopup(popup).addTo(leafletLayer);
        pts.push([ev.lat, ev.lng]);
      }
      if (pts.length) leafletMap.fitBounds(pts, { padding:[30,30] });
    }
  }

  function focusOn(lat,lng){
    if (mapProvider === "apple" && mkMap) {
      mkMap.setCenterAnimated(new mapkit.Coordinate(lat, lng));
      return;
    }
    if (mapProvider === "leaflet" && leafletMap) {
      leafletMap.setView([lat,lng], 15);
      L.marker([lat,lng]).addTo(leafletLayer);
    }
  }

  // ====== Local helpers ======
  function getLocal(key){
    const k = key==="friends" ? "linkup_friends"
            : key==="likes" ? "linkup_likes"
            : key==="rsvps" ? "linkup_rsvps"
            : "linkup_events";
    try { return JSON.parse(localStorage.getItem(k) || (key==="likes"||key==="rsvps" ? "{}" : "[]")); }
    catch { return (key==="likes"||key==="rsvps") ? {} : []; }
  }
  function setLocal(key,val){
    const k = key==="friends" ? "linkup_friends"
            : key==="likes" ? "linkup_likes"
            : key==="rsvps" ? "linkup_rsvps"
            : "linkup_events";
    localStorage.setItem(k, JSON.stringify(val));
  }
  function saveLocalEvent(p){ const list = getLocal("events"); list.push(p); setLocal("events", list); }

  // Utils
  function byId(id){ return document.getElementById(id); }
  function v(id){ return (byId(id)?.value || "").trim(); }
  function toNum(s){ const n = parseFloat(s); return isFinite(n) ? n : NaN; }
  function toggle(el, show){ el && el.classList.toggle("hide", !show); }
  function esc(s){ return (s||"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
  function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
})();

