// main.js
// 入口脚本：加载推荐数据、初始化地图、集成定位、筛选、抽奖

let restaurants = [];
let filteredRestaurants = [];
let mapInstance = null;

// Haversine公式计算两点间距离（单位：米）
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

document.addEventListener('DOMContentLoaded', function() {
    getUserLocation(function(userLoc) {
        window.userLocation = userLoc;
        fetch('data/restaurants.json')
            .then(res => res.json())
            .then(data => {
                // 增加更多牛逼的餐厅
                restaurants = data.concat(extraRestaurants());
                bindFilterEvents();
                loadRecommendations(userLoc);
                initMap(userLoc);
            });
    });
});

function getUserLocation(callback) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                callback({ lat, lng });
            },
            function(error) {
                alert('定位失败，将使用默认位置。');
                callback({ lat: 31.2304, lng: 121.4737 }); // 上海市中心
            }
        );
    } else {
        alert('浏览器不支持定位，将使用默认位置。');
        callback({ lat: 31.2304, lng: 121.4737 });
    }
}

function bindFilterEvents() {
    document.getElementById('price-filter').addEventListener('change', function() {
        loadRecommendations(window.userLocation);
    });
    document.getElementById('tag-filter').addEventListener('change', function() {
        loadRecommendations(window.userLocation);
    });
    document.getElementById('lottery-btn').addEventListener('click', function() {
        if (filteredRestaurants.length === 0) return;
        const idx = Math.floor(Math.random() * filteredRestaurants.length);
        const lucky = filteredRestaurants[idx];
        highlightLottery(lucky.id);
    });
}

function loadRecommendations(userLoc) {
    // 筛选
    const price = document.getElementById('price-filter').value;
    const tag = document.getElementById('tag-filter').value;
    filteredRestaurants = restaurants.filter(r => {
        let ok = true;
        if (price && r.price_level !== price) ok = false;
        if (tag && !(r.tags.includes(tag) || (r.scene && r.scene.includes(tag)))) ok = false;
        return ok;
    });
    // 计算距离
    filteredRestaurants.forEach(r => {
        r.distance = getDistance(userLoc.lat, userLoc.lng, r.lat, r.lng);
    });
    // 黄金公式排序：(评分×0.6) + (环境系数×0.3) - (价格系数×0.1) + 距离加权
    filteredRestaurants.sort((a, b) => {
        const aScore = a.rating * 0.6 + (a.tags.length + (a.scene?a.scene.length:0)) * 0.3 - (a.avg_price/100) * 0.1 - a.distance/20000;
        const bScore = b.rating * 0.6 + (b.tags.length + (b.scene?b.scene.length:0)) * 0.3 - (b.avg_price/100) * 0.1 - b.distance/20000;
        return bScore - aScore;
    });
    renderRecommendList();
    updateMapMarkers();
}

function renderRecommendList() {
    const recommendList = document.getElementById('recommend-list');
    if (filteredRestaurants.length === 0) {
        recommendList.innerHTML = '<p>没有符合条件的餐厅。</p>';
        return;
    }
    recommendList.innerHTML = filteredRestaurants.map(r => `
        <div class="restaurant-card" id="rest-${r.id}">
            <h3>${r.name} <span class="price">${r.price_level}</span></h3>
            <div class="tags">${[...(r.tags||[]),...(r.scene||[]),...(r.seasonal||[])].map(t=>`<span>${t}</span>`).join(' ')}</div>
            <div class="info">
                <span>评分：${r.rating} (${r.review_count}条)</span>
                <span>人均：¥${r.avg_price}</span>
                <span>距离：${r.distance<1000?Math.round(r.distance)+'m':(r.distance/1000).toFixed(1)+'km'}</span>
            </div>
            <div class="comments">
                <b>情侣评价：</b>
                <ul>${r.comments.slice(0,3).map(c=>`<li>“${c}”</li>`).join('')}</ul>
            </div>
            <div class="extra">
                <span>成功率：${Math.round(r.success_rate*100)}%</span>
                <span>${r.wait_warning||''}</span>
                ${r.has_socket?'<span>附近有插座</span>':''}
            </div>
        </div>
    `).join('');
}

function highlightLottery(id) {
    // 高亮抽中的餐厅卡片
    document.querySelectorAll('.restaurant-card').forEach(card => {
        card.classList.remove('lottery-highlight');
    });
    const card = document.getElementById('rest-' + id);
    if (card) {
        card.classList.add('lottery-highlight');
        card.scrollIntoView({behavior:'smooth', block:'center'});
    }
}

function initMap(userLoc) {
    mapboxgl.accessToken = 'pk.eyJ1IjoibWFwYm94dXNlciIsImEiOiJja3Z2b2Z2b2gwM2JwMnBvN2Z2b2Z2b2gwIn0.2vQw1vQw1vQw1vQw1vQw1w'; // 请替换为你的token
    mapInstance = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [userLoc.lng, userLoc.lat],
        zoom: 13
    });
    // 用户位置标记
    new mapboxgl.Marker({color: '#e94e77'})
        .setLngLat([userLoc.lng, userLoc.lat])
        .setPopup(new mapboxgl.Popup().setText('你的位置'))
        .addTo(mapInstance);
    updateMapMarkers();
}

function updateMapMarkers() {
    if (!mapInstance) return;
    // 先移除旧的marker
    if (mapInstance.restaurantMarkers) {
        mapInstance.restaurantMarkers.forEach(m=>m.remove());
    }
    mapInstance.restaurantMarkers = [];
    filteredRestaurants.forEach(r => {
        const marker = new mapboxgl.Marker()
            .setLngLat([r.lng, r.lat])
            .setPopup(new mapboxgl.Popup().setText(r.name))
            .addTo(mapInstance);
        mapInstance.restaurantMarkers.push(marker);
    });
}

function extraRestaurants() {
    // 增加更多牛逼的餐厅
    return [
        {
            "id": 101,
            "name": "云端星空餐厅",
            "address": "上海市浦东新区陆家嘴环路888号",
            "lat": 31.240,
            "lng": 121.510,
            "avg_price": 520,
            "price_level": "💎高端",
            "rating": 4.95,
            "review_count": 88,
            "tags": ["🌹浪漫露台", "📸网红墙"],
            "seasonal": ["🌸樱花季套餐"],
            "scene": ["首次约会安全牌"],
            "comments": [
                "夜景无敌，女友说像在电影里！",
                "星空顶灯光超浪漫，适合表白。",
                "服务生会帮忙拍合影，体验感爆棚。"
            ],
            "success_rate": 0.93,
            "wait_warning": "需提前预约",
            "has_socket": true
        },
        {
            "id": 102,
            "name": "深夜日料居酒屋",
            "address": "上海市徐汇区肇嘉浜路789号",
            "lat": 31.202,
            "lng": 121.437,
            "avg_price": 180,
            "price_level": "💰适中",
            "rating": 4.8,
            "review_count": 210,
            "tags": ["🎻Live音乐"],
            "seasonal": ["❄️冬日暖锅"],
            "scene": ["惊喜模式"],
            "comments": [
                "深夜氛围感拉满，适合小酌。",
                "老板娘会推荐隐藏菜单，超有趣。",
                "有插座，手机没电救星！"
            ],
            "success_rate": 0.85,
            "wait_warning": "周末等位20分钟",
            "has_socket": true
        },
        {
            "id": 103,
            "name": "复古摩登咖啡馆",
            "address": "上海市长宁区延安西路321号",
            "lat": 31.218,
            "lng": 121.410,
            "avg_price": 88,
            "price_level": "💵经济",
            "rating": 4.6,
            "review_count": 156,
            "tags": ["📸网红墙"],
            "seasonal": [],
            "scene": ["首次约会安全牌"],
            "comments": [
                "咖啡好喝，环境复古，适合聊天。",
                "有网红墙，女友拍照停不下来。",
                "价格亲民，性价比高。"
            ],
            "success_rate": 0.78,
            "wait_warning": "无需等位",
            "has_socket": true
        },
        {
            "id": 104,
            "name": "江景法式餐厅",
            "address": "上海市黄浦区中山东一路1号",
            "lat": 31.240,
            "lng": 121.490,
            "avg_price": 398,
            "price_level": "💎高端",
            "rating": 4.92,
            "review_count": 132,
            "tags": ["🌹浪漫露台", "📸网红墙"],
            "seasonal": ["🌸樱花季套餐"],
            "scene": ["首次约会安全牌"],
            "comments": [
                "江景一流，适合纪念日。",
                "法餐精致，女友说很有仪式感。",
                "服务贴心，体验感极佳。"
            ],
            "success_rate": 0.89,
            "wait_warning": "需提前预约",
            "has_socket": false
        }
    ];
} 