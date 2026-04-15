/**
 * ABAR IQ Enterprise - Premium Grand Analytics
 * Restored Stacked/Large View + Responsive Engine
 */

document.addEventListener('DOMContentLoaded', () => {
    let state = {
        product: {
            baseCost: 11920, bundleCount: 1, salePrice: 17880, packingFee: 0, deliveryFeeGlobal: 0,
            lossRate: 0, extraCostPerBundle: 0, extraCostPerItem: 0, modelFeeFixed: 0, modelPerOrder: 0, modelFeeRate: 0,
            returnRate: 17, conversionRate: 100
        },
        channels: [{ id: 'ch1', name: 'GS신', fixedFee: 20000000, commRate: 20, fixedFee2: 0, commRate2: 20, isOnePlusOne: false, deliveryFee: 0, targetRevenue1: 99800000, targetRevenue2: 0 }],
        actual: { channelId: 'ch1' },
        actuals: {}
    };

    const achievementLevels = [0.6, 0.7, 0.8, 0.9, 1.0];

    const GITHUB_REPO = 'evinjeong/homeshopping-dashboard';
    const GITHUB_PATH = 'data/projects.json';

    function crypt(text, key) {
        if (!key) return text;
        try {
            const k = key.repeat(Math.ceil(text.length / key.length));
            return btoa([...text].map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ k.charCodeAt(i))).join(''));
        } catch (e) { return text; }
    }
    function decrypt(text, key) {
        if (!key || !text) return text;
        try {
            const decoded = atob(text);
            const k = key.repeat(Math.ceil(decoded.length / key.length));
            return [...decoded].map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ k.charCodeAt(i))).join('');
        } catch (e) { return text; }
    }

    async function fetchFromCloud(token) {
        try {
            // Use Raw URL for getting data - more reliable and simpler headers
            const RAW_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${GITHUB_PATH}?t=${Date.now()}`;
            const res = await fetch(RAW_URL, { cache: 'no-store' });

            // To get SHA for PUT, we still need the API, but let's try to get it separately
            const API_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}?t=${Date.now()}`;
            const apiRes = await fetch(API_URL);
            let sha = null;
            if (apiRes.ok) {
                const apiData = await apiRes.json();
                sha = apiData.sha;
            }

            if (!res.ok) {
                if (res.status === 404) return { sha: null, projs: {} };
                window.lastErrorStatus = res.status;
                window.lastErrorMessage = "Raw 데이터 접근 실패";
                return null;
            }

            const contentStr = await res.text();
            return { sha, projs: JSON.parse(contentStr) };
        } catch (e) {
            console.error('Fetch Error:', e);
            window.lastErrorStatus = 'Trace';
            window.lastErrorMessage = `${e.name}: ${e.message}`;
            return null;
        }
    }

    async function syncToCloud(projs, token, currentSha) {
        if (!token) return false;
        try {
            const jsonStr = JSON.stringify(projs, null, 2);
            const bytes = new TextEncoder().encode(jsonStr);
            let binary = "";
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            const contentEncoded = btoa(binary);

            const bodyObj = {
                message: "Auto-sync projects.json from Dashboard",
                content: contentEncoded
            };
            if (currentSha) {
                bodyObj.sha = currentSha;
            }

            const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify(bodyObj)
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                console.error('Sync error details:', res.status, errData);
                window.lastErrorStatus = res.status;
                window.lastErrorMessage = errData.message || '알 수 없는 오류';
                return false;
            }
            return true;
        } catch (e) {
            console.error('Github Sync Error:', e);
            window.lastErrorStatus = 'Network';
            window.lastErrorMessage = e.message;
            return false;
        }
    }

    async function fetchPublicData() {
        try {
            const res = await fetch(`data/projects.json?t=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) return;
            const text = await res.text();
            let contentStr = text;
            if (contentStr.charCodeAt(0) === 0xFEFF) contentStr = contentStr.substring(1);
            const projs = JSON.parse(contentStr);
            if (projs) {
                // Settings Sync: Extract system settings if exists
                if (projs.__system__) {
                    const sys = projs.__system__;
                    // Restore password and theme first
                    if (sys.password) localStorage.setItem('abar_password', sys.password);
                    if (sys.theme) localStorage.setItem('abar_theme', sys.theme);

                    // Decrypt and restore GitHub Token safely
                    if (sys.github_token && sys.password) {
                        const decryptedToken = decrypt(sys.github_token, sys.password);
                        localStorage.setItem('abar_github_token', decryptedToken);
                    } else if (sys.github_token) {
                        localStorage.setItem('abar_github_token', sys.github_token);
                    }

                    delete projs.__system__;
                }
                const local = getProjects();
                Object.assign(local, projs);
                saveProjects(local);
                updateProjectDropdown();
                console.log('System settings safely synced and decrypted from cloud.');
            }
        } catch (e) { }
    }

    function getProjects() { return JSON.parse(localStorage.getItem('abar_projects')) || {}; }
    function saveProjects(projs) { localStorage.setItem('abar_projects', JSON.stringify(projs)); }

    function initProjectManager() {
        updateProjectDropdown();
        document.getElementById('saveProjectBtn').addEventListener('click', async () => {
            const pName = document.getElementById('projectName').value.trim();
            if (!pName) return alert('저장할 프로젝트명을 입력해주세요.');

            const btn = document.getElementById('saveProjectBtn');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';
            btn.disabled = true;

            try {
                window.lastErrorStatus = null;
                window.lastErrorMessage = '';

                const token = localStorage.getItem('abar_github_token');
                let currentSha = null;
                let projs = getProjects();

                if (token && token.trim()) {
                    const cloudData = await fetchFromCloud(token.trim());
                    if (cloudData === null) {
                        const errInfo = window.lastErrorStatus ? `(에러: ${window.lastErrorStatus} - ${window.lastErrorMessage})` : '';
                        alert(`[V3] 클라우드 정보를 불러오지 못해 자동 저장을 중단합니다.\n${errInfo}`);
                        return;
                    }
                    currentSha = cloudData.sha;
                    if (cloudData.projs) projs = { ...cloudData.projs, ...projs };
                }

                projs[pName] = JSON.parse(JSON.stringify(state));
                saveProjects(projs);

                if (token && token.trim()) {
                    // Wrap with system settings for cloud sync (keeps local clean)
                    const pw = localStorage.getItem('abar_password');
                    const rawToken = localStorage.getItem('abar_github_token');
                    const encryptedToken = pw ? crypt(rawToken, pw) : rawToken;

                    const fullSyncData = {
                        __system__: {
                            password: pw,
                            theme: localStorage.getItem('abar_theme'),
                            github_token: encryptedToken
                        },
                        ...projs
                    };
                    const success = await syncToCloud(fullSyncData, token.trim(), currentSha);
                    if (!success) {
                        alert(`로컬에는 저장되었으나 클라우드 동기화에 실패했습니다.\n(${window.lastErrorStatus}: ${window.lastErrorMessage})`);
                    } else {
                        alert('프로젝트가 로컬 및 클라우드에 성공적으로 저장되었습니다!');
                    }
                } else {
                    alert('프로젝트가 로컬에 저장되었습니다.');
                }
            } catch (e) {
                console.error('Save Error:', e);
                alert('저장 중 오류가 발생했습니다: ' + e.message);
            } finally {
                btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 저장/수정';
                btn.disabled = false;
                updateProjectDropdown();
                document.getElementById('projectSelect').value = pName;
            }
        });

        document.getElementById('deleteProjectBtn').addEventListener('click', async () => {
            const pName = document.getElementById('projectSelect').value;
            if (!pName) return alert('삭제할 프로젝트를 불러오기 목록에서 선택해주세요.');
            if (confirm(`정말 '${pName}' 프로젝트를 영구 삭제하시겠습니까?`)) {
                const token = localStorage.getItem('abar_github_token');
                let projs = getProjects();
                let currentSha = null;

                if (token && token.trim()) {
                    const cloudData = await fetchFromCloud(token.trim());
                    if (cloudData) {
                        currentSha = cloudData.sha;
                    }
                }

                if (projs[pName]) delete projs[pName];
                saveProjects(projs);
                updateProjectDropdown();
                document.getElementById('projectName').value = '';

                if (token && token.trim()) {
                    const btn = document.getElementById('deleteProjectBtn');
                    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                    await syncToCloud(projs, token.trim(), currentSha);
                    btn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
                }
            }
        });

        document.getElementById('projectSelect').addEventListener('change', (e) => {
            const pName = e.target.value;
            if (!pName) return;
            const projs = getProjects();
            if (projs[pName]) {
                state = JSON.parse(JSON.stringify(projs[pName]));
                document.getElementById('projectName').value = pName;
                refreshUI();
            }
        });

        document.getElementById('shareProjectBtn')?.addEventListener('click', () => {
            try {
                const dataStr = JSON.stringify(state);
                const base64Data = btoa(unescape(encodeURIComponent(dataStr)));
                const url = window.location.origin + window.location.pathname + '?p=' + encodeURIComponent(base64Data);

                navigator.clipboard.writeText(url).then(() => {
                    alert('현재 화면의 통합 설정이 고유 링크로 복사되었습니다!\nPC/모바일 메신저 등 어디든 붙여넣기 하시면 같은 화면이 열립니다.');
                }).catch(err => {
                    prompt('아래 링크를 전체 복사하여 다른 기기로 전달해주세요:', url);
                });
            } catch (e) {
                alert('데이터가 너무 커서 링크를 생성할 수 없습니다.');
            }
        });
    }


    function init() {
        fetchPublicData();

        const urlParams = new URLSearchParams(window.location.search);
        const sharedData = urlParams.get('p');
        if (sharedData) {
            try {
                const decoded = decodeURIComponent(escape(atob(sharedData)));
                state = JSON.parse(decoded);
                setTimeout(() => alert('공유받은 프로젝트 설정 데이터를 성공적으로 불러왔습니다!'), 100);
                window.history.replaceState({}, document.title, window.location.pathname);
            } catch (e) {
                setTimeout(() => alert('공유 링크 정보가 올바르지 않거나 손상되었습니다.'), 100);
            }
        }

        if (!state.actuals) state.actuals = {};
        bindGlobalInputs();
        renderInputTable();
        bindActualInputs();
        refreshActualUI();
        calculateAndRender();
        initProjectManager();
        initSystemSettings();

        document.getElementById('addChannelBtn').addEventListener('click', () => {
            state.channels.push({ id: Date.now().toString(), name: '신규 채널', fixedFee: 0, commRate: 20, fixedFee2: 0, commRate2: 20, isOnePlusOne: false, deliveryFee: 0, targetRevenue1: 100000000, targetRevenue2: 0 });
            renderInputTable();
            calculateAndRender();
        });
    }

    function bindGlobalInputs() {
        const ids = ['baseCost', 'bundleCount', 'salePrice', 'packingFee', 'deliveryFeeGlobal', 'lossRate', 'extraCostPerBundle', 'extraCostPerItem', 'modelFeeFixed', 'modelPerOrder', 'modelFeeRate', 'returnRate', 'conversionRate'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.value = state.product[id];
                el.addEventListener('input', e => { state.product[id] = parseFloat(e.target.value) || 0; calculateAndRender(); });
            }
        });
    }

    function renderInputTable() {
        const body = document.getElementById('channelTableBody');
        body.innerHTML = '';
        const select = document.getElementById('actualChannelSelect');
        if (select) {
            select.innerHTML = state.channels.map(ch => `<option value="${ch.id}">${ch.name}</option>`).join('');
            if (!state.channels.find(c => c.id === state.actual.channelId) && state.channels.length > 0) state.actual.channelId = state.channels[0].id;
            select.value = state.actual.channelId;
        }
        state.channels.forEach((ch, idx) => {
            const row = document.getElementById('channelRowTemplate').content.cloneNode(true);
            const r = row.querySelector('.channel-row');
            r.querySelector('.channel-name').value = ch.name;
            r.querySelector('.fixed-fee').value = ch.fixedFee;
            r.querySelector('.comm-rate').value = ch.commRate;
            r.querySelector('.fixed-fee-2').value = ch.fixedFee2;
            r.querySelector('.comm-rate-2').value = ch.commRate2;
            r.querySelector('.delivery-fee').value = ch.deliveryFee;
            r.querySelector('.target-revenue-1').value = ch.targetRevenue1;
            r.querySelector('.target-revenue-2').value = ch.targetRevenue2;

            const toggle = r.querySelector('.one-plus-one-toggle');
            toggle.checked = ch.isOnePlusOne;
            const updateRowUI = () => {
                const sec = r.querySelector('.secondary-fee-ui');
                const t2 = r.querySelector('.target-revenue-2');
                if (toggle.checked) { sec.style.opacity = '1'; t2.disabled = false; }
                else { sec.style.opacity = '0.25'; t2.disabled = true; }
            };
            updateRowUI();

            r.querySelectorAll('input').forEach(input => {
                input.addEventListener('input', () => {
                    ch.name = r.querySelector('.channel-name').value;
                    ch.fixedFee = parseFloat(r.querySelector('.fixed-fee').value) || 0;
                    ch.commRate = parseFloat(r.querySelector('.comm-rate').value) || 0;
                    ch.fixedFee2 = parseFloat(r.querySelector('.fixed-fee-2').value) || 0;
                    ch.commRate2 = parseFloat(r.querySelector('.comm-rate-2').value) || 0;
                    ch.deliveryFee = parseFloat(r.querySelector('.delivery-fee').value) || 0;
                    ch.targetRevenue1 = parseFloat(r.querySelector('.target-revenue-1').value) || 0;
                    ch.targetRevenue2 = parseFloat(r.querySelector('.target-revenue-2').value) || 0;
                    ch.isOnePlusOne = toggle.checked;
                    updateRowUI();
                    calculateAndRender();
                });
            });

            r.querySelector('.delete-btn').addEventListener('click', () => {
                state.channels.splice(idx, 1); renderInputTable(); calculateAndRender();
            });
            body.appendChild(row);
        });
    }

    function calculateAndRender() {
        const select = document.getElementById('actualChannelSelect');
        if (select) {
            select.innerHTML = state.channels.map(ch => `<option value="${ch.id}">${ch.name}</option>`).join('');
            select.value = state.actual.channelId;
        }
        const container = document.getElementById('detailedChannelCards');
        container.innerHTML = '';
        state.channels.forEach(ch => {
            const data = calculateTriple(ch);
            renderAnalysisCard(ch, data);
        });
        calculateActual();
    }

    function calculateActualMetrics(act, ch, p) {
        if (!act) return null;
        const currentConvRate1 = act.convRate !== undefined ? (act.convRate / 100) : (p.conversionRate / 100);
        const currentConvRate2 = act.convRate2 !== undefined ? (act.convRate2 / 100) : (p.conversionRate / 100);
        const currentRetRate1 = act.returnRate !== undefined ? (act.returnRate / 100) : (p.returnRate / 100);
        const currentRetRate2 = act.returnRate2 !== undefined ? (act.returnRate2 / 100) : (p.returnRate / 100);

        let rev1 = 0, orderQty1 = 0;
        if (act.inputType === 'rev') {
            rev1 = act.inputValue;
            orderQty1 = p.salePrice > 0 ? rev1 / p.salePrice : 0;
        } else {
            orderQty1 = act.inputValue;
            rev1 = orderQty1 * p.salePrice;
        }

        let rev2 = 0, orderQty2 = 0;
        if (ch.isOnePlusOne) {
            if (act.inputType2 === 'rev') {
                rev2 = act.inputValue2;
                orderQty2 = p.salePrice > 0 ? rev2 / p.salePrice : 0;
            } else {
                orderQty2 = act.inputValue2;
                rev2 = orderQty2 * p.salePrice;
            }
        }

        const totalOrderQty = orderQty1 + orderQty2;
        const totalNetOrderQty1 = orderQty1 * currentConvRate1 * (1 - currentRetRate1);
        const totalNetOrderQty2 = orderQty2 * currentConvRate2 * (1 - currentRetRate2);
        const totalNetOrderQty = totalNetOrderQty1 + totalNetOrderQty2;

        const lossF = 1 - (p.lossRate / 100);
        const baseItemCost = p.baseCost + p.extraCostPerItem;
        const invC = (baseItemCost * p.bundleCount) / (lossF > 0 ? lossF : 1);
        const baseVar = invC + p.packingFee + p.deliveryFeeGlobal + p.extraCostPerBundle;
        const costPerNetItem = baseVar + ch.deliveryFee + p.modelPerOrder;

        const netRev1 = rev1 * currentConvRate1 * (1 - currentRetRate1);
        const netRev2 = rev2 * currentConvRate2 * (1 - currentRetRate2);
        const totalNetRev = netRev1 + netRev2;

        const comm1 = rev1 * (ch.commRate / 100);
        const comm2 = rev2 * (ch.commRate2 / 100);

        const broadcastFixed1 = ch.fixedFee + p.modelFeeFixed + (rev1 * p.modelFeeRate / 100);
        const broadcastFixed2 = ch.isOnePlusOne ? (ch.fixedFee2 + (rev2 * p.modelFeeRate / 100)) : 0;

        const varCost1 = totalNetOrderQty1 * costPerNetItem;
        const varCost2 = totalNetOrderQty2 * costPerNetItem;

        const postCosts = act.guestCost + act.demoCost + act.promoCost + act.otherCost;
        const profit = totalNetRev - (comm1 + comm2) - (varCost1 + varCost2) - (broadcastFixed1 + broadcastFixed2) - postCosts;
        const margin = totalNetRev > 0 ? (profit / totalNetRev) * 100 : 0;

        return {
            rev1, orderQty1, netRev1, comm1, broadcastFixed1, varCost1,
            rev2, orderQty2, netRev2, comm2, broadcastFixed2, varCost2,
            totalRev: rev1 + rev2, totalOrderQty, totalNetOrderQty, totalNetRev,
            totalComm: comm1 + comm2, totalBroadcastFixed: broadcastFixed1 + broadcastFixed2,
            totalVar: varCost1 + varCost2, postCosts, profit, margin
        };
    }

    function calculateTriple(ch) {
        const p = state.product;
        const lossF = 1 - (p.lossRate / 100);
        const baseItemCost = p.baseCost + p.extraCostPerItem;
        const invC = (baseItemCost * p.bundleCount) / (lossF > 0 ? lossF : 1);
        const baseVar = invC + p.packingFee + p.deliveryFeeGlobal + p.extraCostPerBundle;
        const nSR = (p.conversionRate / 100) * (1 - p.returnRate / 100);

        const getM = (tr, ff, cr, incModel) => achievementLevels.map(l => {
            const rev = tr * l;
            const qty = rev / p.salePrice;
            const sq = qty * (p.conversionRate / 100);
            const netS = rev * nSR;
            const comm = rev * (cr / 100);
            const cost = (sq * baseVar) + (sq * ch.deliveryFee) + (sq * p.modelPerOrder);
            const fix = ff + (incModel ? p.modelFeeFixed : 0) + (rev * p.modelFeeRate / 100);
            const prof = netS - comm - cost - fix;
            return { rev, netS, qty, comm, cost, fix, prof, margin: netS > 0 ? (prof / netS) * 100 : 0 };
        });

        const m1 = getM(ch.targetRevenue1, ch.fixedFee, ch.commRate, true);
        const m2 = ch.isOnePlusOne ? getM(ch.targetRevenue2, ch.fixedFee2, ch.commRate2, false) : null;
        let comb = null;
        if (m2) {
            comb = achievementLevels.map((l, i) => {
                const ns = m1[i].netS + m2[i].netS;
                const pr = m1[i].prof + m2[i].prof;
                return { rev: m1[i].rev + m2[i].rev, netS: ns, qty: m1[i].qty + m2[i].qty, comm: m1[i].comm + m2[i].comm, cost: m1[i].cost + m2[i].cost, fix: m1[i].fix + m2[i].fix, prof: pr, margin: ns > 0 ? (pr / ns) * 100 : 0 };
            });
        }
        const bepRev = (nSR - (ch.commRate / 100) - (p.modelFeeRate / 100) - ((baseVar + ch.deliveryFee + p.modelPerOrder) / p.salePrice) > 0) ? (ch.fixedFee + p.modelFeeFixed) / (nSR - (ch.commRate / 100) - (p.modelFeeRate / 100) - ((baseVar + ch.deliveryFee + p.modelPerOrder) / p.salePrice)) : 0;
        return { m1, m2, comb, bepRev, netPct: (nSR * 100).toFixed(0) };
    }

    function renderAnalysisCard(ch, res) {
        const container = document.getElementById('detailedChannelCards');
        const template = document.getElementById('analysisCardTemplate').content.cloneNode(true);
        const card = template.querySelector('.image-card');
        card.querySelector('.ch-name').textContent = ch.name;
        const area = card.querySelector('.ch-summary-area');
        area.innerHTML = `<div class="ch-summary-line">1차: <span>${ch.fixedFee.toLocaleString()} / ${ch.commRate}% / ${ch.targetRevenue1.toLocaleString()}</span></div>`;
        if (ch.isOnePlusOne) area.innerHTML += `<div class="ch-summary-line">2차: <span>${ch.fixedFee2.toLocaleString()} / ${ch.commRate2}% / ${ch.targetRevenue2.toLocaleString()}</span></div>`;
        card.querySelector('.bep-val-num').textContent = formatWon(res.bepRev);

        const sects = card.querySelector('.analysis-sections-container');

        if (state.actuals && state.actuals[ch.id] && state.actuals[ch.id].isSaved) {
            const metrics = calculateActualMetrics(state.actuals[ch.id], ch, state.product);
            if (metrics) {
                sects.appendChild(createActualTable(
                    ch.isOnePlusOne ? "■ 실제 실적 사후 정산 리포트 (통합)" : "■ 실제 실적 사후 정산 리포트",
                    metrics, ch, res.netPct
                ));
            }
        }

        if (res.comb) {
            sects.appendChild(createTable("통합 시네리오 분석 (Combined)", res.comb, res.netPct, true));
            sects.appendChild(createTable("1차 방송 상세 수익", res.m1, res.netPct));
            sects.appendChild(createTable("2차 방송 상세 수익", res.m2, res.netPct));
        } else {
            sects.appendChild(createTable("수익 분석 리포트", res.m1, res.netPct, true));
        }
        container.appendChild(card);
    }

    function createActualTable(title, metrics, ch, netPct) {
        const w = document.createElement('div');
        const isOpt = ch.isOnePlusOne;

        let thead = isOpt
            ? `<tr><th style="width:25%;">지표</th><th>1차 방송 실적</th><th>2차 방송 실적</th><th>통합 정산 내역</th></tr>`
            : `<tr><th style="width:25%;">지표</th><th>실측 정산 내역</th></tr>`;

        let dRev = isOpt ? [fN(metrics.rev1), fN(metrics.rev2), fN(metrics.totalRev)] : [fN(metrics.totalRev)];
        let dQty = isOpt ? [fN(metrics.orderQty1), fN(metrics.orderQty2), fN(metrics.totalOrderQty)] : [fN(metrics.totalOrderQty)];
        let dNetS = isOpt ? [fN(metrics.netRev1), fN(metrics.netRev2), fN(metrics.totalNetRev)] : [fN(metrics.totalNetRev)];
        let dComm = isOpt ? [fN(metrics.comm1), fN(metrics.comm2), fN(metrics.totalComm)] : [fN(metrics.totalComm)];
        let dCost = isOpt ? [fN(metrics.varCost1), fN(metrics.varCost2), fN(metrics.totalVar)] : [fN(metrics.totalVar)];
        let dFix = isOpt ? [fN(metrics.broadcastFixed1), fN(metrics.broadcastFixed2), fN(metrics.totalBroadcastFixed + metrics.postCosts)] : [fN(metrics.totalBroadcastFixed + metrics.postCosts)];

        let prof1 = metrics.netRev1 - metrics.comm1 - metrics.varCost1 - metrics.broadcastFixed1;
        let prof2 = metrics.netRev2 - metrics.comm2 - metrics.varCost2 - metrics.broadcastFixed2;
        let dProf = isOpt ? [fN(prof1), fN(prof2), fN(metrics.profit)] : [fN(metrics.profit)];

        let m1 = metrics.netRev1 > 0 ? (prof1 / metrics.netRev1) * 100 : 0;
        let m2 = metrics.netRev2 > 0 ? (prof2 / metrics.netRev2) * 100 : 0;
        let dMargin = isOpt ? [m1.toFixed(1) + '%', m2.toFixed(1) + '%', metrics.margin.toFixed(1) + '%'] : [metrics.margin.toFixed(1) + '%'];

        w.innerHTML = `
            <div class="analysis-sub-header" style="color:var(--brand-color); background: rgba(30, 64, 175, 0.2); border: 1px solid rgba(59, 130, 246, 0.3); border-bottom: none; border-radius: 6px 6px 0 0; padding: 12px 16px; margin-bottom: 0;">${title}</div>
            <table class="analysis-table" style="border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 0 0 6px 6px; margin-top: 0; margin-bottom: 2rem;">
                <thead>${thead}</thead>
                <tbody>
                    ${rRowActual('주문 금액', dRev)}
                    ${rRowActual('판매 수량(세트)', dQty)}
                    ${rRowActual(`매출액(${netPct}%)`, dNetS)}
                    ${rRowActual('방송 수수료', dComm, 'row-negative')}
                    ${rRowActual('변동 원가', dCost, 'row-negative')}
                    ${rRowActual('총 고정비(방송+사후)', dFix, 'row-negative')}
                    ${rRowActual('최종 영업 이익', dProf, 'row-profit')}
                    ${rRowActual('이익률', dMargin, 'row-negative')}
                </tbody>
            </table>
        `;
        return w;
    }

    function rRowActual(l, v, c = '') {
        return `<tr><td>${l}</td>${v.map(val => {
            const displayVal = val;
            return `<td class="${c} ${displayVal.toString().startsWith('-') ? 'row-negative' : ''}" style="color: ${c === 'row-profit' && displayVal.toString().startsWith('-') ? 'var(--color-red)' : ''}">${displayVal}</td>`;
        }).join('')}</tr>`;
    }

    function createTable(title, data, netPct, isTotal = false) {
        const w = document.createElement('div');
        w.innerHTML = `
            <div class="analysis-sub-header ${isTotal ? 'total' : ''}">${title}</div>
            <table class="analysis-table">
                <thead><tr><th style="width:25%;">지표</th><th>60%</th><th>70%</th><th>80%</th><th>90%</th><th>100%</th></tr></thead>
                <tbody>
                    ${rRow('주문 금액', data.map(d => fN(d.rev)))}
                    ${rRow('판매 수량(세트)', data.map(d => fN(d.qty)))}
                    ${rRow(`매출액(${netPct}%)`, data.map(d => fN(d.netS)))}
                    ${rRow('방송 수수료', data.map(d => fN(d.comm)), 'row-negative')}
                    ${rRow('변동 원가', data.map(d => fN(d.cost)), 'row-negative')}
                    ${rRow('총 고정비', data.map(d => fN(d.fix)), 'row-negative')}
                    ${rRow('영업 이익', data.map(d => fN(d.prof)), isTotal ? 'row-profit' : '')}
                    ${rRow('이익률', data.map(d => d.margin.toFixed(1) + '%'), 'row-negative')}
                </tbody>
            </table>
        `;
        return w;
    }

    function rRow(l, v, c = '') {
        return `<tr><td>${l}</td>${v.map(val => `<td class="${c} ${val.toString().startsWith('-') ? 'row-negative' : ''}">${val}</td>`).join('')}</tr>`;
    }
    function fN(n) { return Math.round(n).toLocaleString(); }
    function formatWon(n) { return (Math.abs(n) >= 100000000) ? (n / 100000000).toFixed(1) + '억' : (Math.abs(n) >= 10000) ? (n / 10000).toFixed(0) + '만' : fN(n); }

    function initActualState(chId) {
        state.actuals[chId] = { date: '', inputType: 'qty', inputValue: 0, inputType2: 'qty', inputValue2: 0, convRate: state.product.conversionRate, convRate2: state.product.conversionRate, returnRate: state.product.returnRate, returnRate2: state.product.returnRate, guestCost: 0, demoCost: 0, promoCost: 0, otherCost: 0, isSaved: false };
    }

    function refreshActualUI() {
        if (!state.actuals) state.actuals = {};
        const chId = state.actual.channelId;
        if (!state.actuals[chId]) initActualState(chId);

        const act = state.actuals[chId];
        const ch = state.channels.find(c => c.id === chId);

        const ids = ['actualInputValue', 'actualInputValue2', 'actualGuestCost', 'actualDemoCost', 'actualPromoCost', 'actualOtherCost', 'actualConvRate', 'actualConvRate2', 'actualReturnRate', 'actualReturnRate2'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const sKey = id.replace('actual', '').charAt(0).toLowerCase() + id.replace('actual', '').slice(1);
                if (act[sKey] !== undefined) el.value = act[sKey];
                else {
                    if (id === 'actualConvRate' || id === 'actualConvRate2') el.value = state.product.conversionRate || 100;
                    else if (id === 'actualReturnRate' || id === 'actualReturnRate2') el.value = state.product.returnRate || 0;
                    else el.value = 0;
                }
            }
        });

        const dateEl = document.getElementById('actualDate');
        if (dateEl) dateEl.value = act.date || '';

        const typeEl = document.getElementById('actualInputType');
        if (typeEl) typeEl.value = act.inputType || 'qty';

        const typeEl2 = document.getElementById('actualInputType2');
        if (typeEl2) typeEl2.value = act.inputType2 || 'qty';

        const isOpt = ch && ch.isOnePlusOne;
        const g2 = document.getElementById('actual2ndGroup');
        if (g2) {
            g2.style.opacity = isOpt ? '1' : '0.5';
            const in2 = document.getElementById('actualInputValue2');
            const ty2 = document.getElementById('actualInputType2');
            if (in2) in2.disabled = !isOpt;
            if (ty2) ty2.disabled = !isOpt;
        }

        calculateActual();
    }

    function bindActualInputs() {
        const ids = ['actualInputValue', 'actualInputValue2', 'actualGuestCost', 'actualDemoCost', 'actualPromoCost', 'actualOtherCost', 'actualConvRate', 'actualConvRate2', 'actualReturnRate', 'actualReturnRate2'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const stateKey = id.replace('actual', '').charAt(0).toLowerCase() + id.replace('actual', '').slice(1);
                el.addEventListener('input', e => {
                    const chId = state.actual.channelId;
                    if (!state.actuals[chId]) initActualState(chId);
                    state.actuals[chId][stateKey] = parseFloat(e.target.value) || 0;
                    calculateActual();
                });
            }
        });

        const dateEl = document.getElementById('actualDate');
        if (dateEl) {
            dateEl.addEventListener('input', e => {
                const chId = state.actual.channelId;
                if (!state.actuals[chId]) initActualState(chId);
                state.actuals[chId].date = e.target.value;
            });
        }

        const typeEl = document.getElementById('actualInputType');
        if (typeEl) {
            typeEl.addEventListener('change', e => {
                const chId = state.actual.channelId;
                if (!state.actuals[chId]) initActualState(chId);
                state.actuals[chId].inputType = e.target.value;
                calculateActual();
            });
        }

        const typeEl2 = document.getElementById('actualInputType2');
        if (typeEl2) {
            typeEl2.addEventListener('change', e => {
                const chId = state.actual.channelId;
                if (!state.actuals[chId]) initActualState(chId);
                state.actuals[chId].inputType2 = e.target.value;
                calculateActual();
            });
        }

        const select = document.getElementById('actualChannelSelect');
        if (select) {
            select.addEventListener('change', e => {
                state.actual.channelId = e.target.value;
                refreshActualUI();
            });
        }

        const saveBtn = document.getElementById('saveActualBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const chId = state.actual.channelId;
                if (!state.actuals[chId]) initActualState(chId);
                state.actuals[chId].isSaved = true;
                calculateAndRender();
                alert('해당 채널의 실적 사후 정산 결과가 리포트에 추가되었습니다.');
            });
        }
    }

    function calculateActual() {
        const ch = state.channels.find(c => c.id === state.actual.channelId);
        if (!ch) return;
        const act = state.actuals[ch.id];
        if (!act) return;

        const isOpt = ch.isOnePlusOne;
        const g2 = document.getElementById('actual2ndGroup');
        if (g2) {
            g2.style.opacity = isOpt ? '1' : '0.5';
            const in2 = document.getElementById('actualInputValue2');
            const ty2 = document.getElementById('actualInputType2');
            if (in2) in2.disabled = !isOpt;
            if (ty2) ty2.disabled = !isOpt;
        }

        const cr2 = document.getElementById('actualConvRate2');
        if (cr2) cr2.disabled = !isOpt;

        const metrics = calculateActualMetrics(act, ch, state.product);
        if (!metrics) return;

        const netQtyField = document.getElementById('actualNetQty');
        if (netQtyField) netQtyField.value = Math.round(metrics.totalNetOrderQty);

        const container = document.getElementById('actualResultContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="analysis-sub-header total" style="color:var(--brand-color);">최종 실적 사후 시뮬레이션 결과 (${ch.name} 기준)</div>
            <table class="analysis-table">
                <thead>
                    <tr>
                        <th style="width:20%">총 주문액(합산)</th>
                        <th style="width:20%">예상 순매출(합산)</th>
                        <th style="width:20%">총 방송경비(합산)</th>
                        <th style="width:20%">사후 비용 합계</th>
                        <th style="width:20%; color:var(--text-primary);">최종 순손익 (수익률)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>${formatWon(metrics.totalRev)}</td>
                        <td>${formatWon(metrics.totalNetRev)}</td>
                        <td class="row-negative">${formatWon(metrics.totalComm + metrics.totalBroadcastFixed)}</td>
                        <td class="row-negative">${formatWon(metrics.postCosts)}</td>
                        <td class="row-profit" style="color: ${metrics.profit >= 0 ? 'var(--brand-color)' : 'var(--color-red)'} !important">${formatWon(metrics.profit)} (${metrics.margin.toFixed(1)}%)</td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    function updateProjectDropdown() {
        const select = document.getElementById('projectSelect');
        if (!select) return;
        const projs = getProjects();
        select.innerHTML = '<option value="">-- 내 프로젝트 --</option>' + Object.keys(projs).map(k => `<option value="${k}">${k}</option>`).join('');
    }


    function refreshUI() {
        const globals = ['baseCost', 'bundleCount', 'salePrice', 'packingFee', 'deliveryFeeGlobal', 'lossRate', 'extraCostPerBundle', 'extraCostPerItem', 'modelFeeFixed', 'modelPerOrder', 'modelFeeRate', 'returnRate', 'conversionRate'];
        globals.forEach(id => { const el = document.getElementById(id); if (el) el.value = state.product[id]; });

        if (!state.actuals) state.actuals = {};

        if (state.actual && state.actual.orderQty !== undefined) {
            const legacyCId = state.actual.channelId;
            if (!state.actuals[legacyCId]) {
                state.actuals[legacyCId] = {
                    date: state.actual.date || '',
                    inputType: 'qty',
                    inputValue: state.actual.orderQty || 0,
                    guestCost: state.actual.guestCost || 0,
                    demoCost: state.actual.demoCost || 0,
                    promoCost: state.actual.promoCost || 0,
                    otherCost: state.actual.otherCost || 0,
                    isSaved: false
                };
            }
            delete state.actual.orderQty;
        }

        for (let chId in state.actuals) {
            // backward compat for old data
            if (state.actuals[chId].orderQty !== undefined && state.actuals[chId].inputValue === undefined) {
                state.actuals[chId].inputType = 'qty';
                state.actuals[chId].inputValue = state.actuals[chId].orderQty;
            }
        }

        refreshActualUI();

        renderInputTable();
        calculateAndRender();
    }

    function initSystemSettings() {
        // 1. Theme Check
        const savedTheme = localStorage.getItem('abar_theme') || 'dark';
        if (savedTheme === 'light') document.body.classList.add('light-theme');

        document.getElementById('themeDarkBtn')?.addEventListener('click', () => {
            document.body.classList.remove('light-theme');
            localStorage.setItem('abar_theme', 'dark');
        });
        document.getElementById('themeLightBtn')?.addEventListener('click', () => {
            document.body.classList.add('light-theme');
            localStorage.setItem('abar_theme', 'light');
        });

        // 2. Login Check
        const savedPw = localStorage.getItem('abar_password');
        const loginOverlay = document.getElementById('loginOverlay');
        if (savedPw) {
            loginOverlay.style.display = 'flex';
        }

        document.getElementById('loginBtn')?.addEventListener('click', () => {
            const inputPw = document.getElementById('loginPassword').value;
            const currentSavedPw = localStorage.getItem('abar_password');
            if (inputPw === currentSavedPw) {
                loginOverlay.style.display = 'none';
            } else {
                alert('비밀번호가 일치하지 않습니다.');
            }
        });

        // 3. Settings Overlay UI
        const settingsOverlay = document.getElementById('settingsOverlay');
        document.getElementById('menuSettings')?.addEventListener('click', (e) => {
            e.preventDefault();
            settingsOverlay.style.display = 'flex';
        });

        document.getElementById('closeSettingsBtn')?.addEventListener('click', () => {
            settingsOverlay.style.display = 'none';
        });

        // 4. Change Password
        document.getElementById('changePasswordBtn')?.addEventListener('click', () => {
            const curPw = document.getElementById('currentPassword').value.trim();
            const newPw = document.getElementById('newPassword').value.trim();
            const storedPw = localStorage.getItem('abar_password');

            if (storedPw && curPw !== storedPw) {
                return alert('현재 비밀번호가 올바르지 않습니다.');
            }

            if (!newPw) {
                // If they submit empty string, perhaps they want to remove the password?
                if (confirm('비밀번호를 공백으로 저장하면 비밀번호 인증이 무효화됩니다. 진행하시겠습니까?')) {
                    localStorage.removeItem('abar_password');
                    alert('비밀번호가 제거되었습니다.');
                    document.getElementById('currentPassword').value = '';
                    document.getElementById('newPassword').value = '';
                    settingsOverlay.style.display = 'none';
                }
                return;
            }

            localStorage.setItem('abar_password', newPw);
            alert('비밀번호가 성공적으로 설정되었습니다. 다음 접속시부터 적용됩니다.');
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            settingsOverlay.style.display = 'none';
        });

        document.getElementById('saveGithubTokenBtn')?.addEventListener('click', () => {
            const tk = document.getElementById('githubToken').value.trim();
            if (!tk) {
                if (confirm('토큰을 지웁니까? 클라우드 동기화가 중단됩니다.')) {
                    localStorage.removeItem('abar_github_token');
                    alert('토큰이 지워졌습니다.');
                }
                return;
            }
            localStorage.setItem('abar_github_token', tk);
            alert('토큰이 저장되었습니다. 이제부터 저장 시 깃허브에 백업됩니다.');
            document.getElementById('githubToken').value = '';
            settingsOverlay.style.display = 'none';
        });
    }

    init();
});
