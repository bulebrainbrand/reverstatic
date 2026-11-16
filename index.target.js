(qC, Cq, iC) => {
  iC.r(Cq);
  iC.d(Cq, {
    default: () => Uq,
    tickMovementInputsPrePhysics: () => Pq
  });
  var Gq,
    vC,
    Jq,
    Kq,
    tC,
    Iq,
    Xq,
    Dq,
    nq,
    Sq = iC(16),
    bq = iC(23),
    mC = iC(30459),
    uq = iC(764),
    sq = iC(654),
    Lq = iC(3098),
    jC = iC(219),
    fq = iC(721),
    oq = iC(30478),
    Qq = iC(30179);
  function Uq(qC) {
    return {
      name: "movementInputs",
      order: 20,
      state: {
        joystickHeading: null,
        joyStickMoveVec: null,
        isTouchscreen: false,
        canRunCombinator: null,
        crouchToggled: false,
        jump: false,
        forward: false,
        backward: false,
        left: false,
        right: false,
        crouch: false,
        sprint: false,
        _moving: false,
        _running: false
      },
      qK: function (qC, Cq) {
        Cq.canRunCombinator = new Lq.d();
        Cq.canRunCombinator.setBooleanType("standardCanRun", true);
      }
    };
  }
  function Pq(qC, Cq) {
    const iC = qC.bJ.ds("movementInputs"),
      {
        bJ: Gq
      } = qC,
      vC = Qq.d.getPlayerFacingHeading(qC);
    for (const Jq of iC) {
      const iC = Gq.DK(Jq.Tu),
        Kq = Gq.SK(Jq.Tu),
        tC = Kq.physicsState,
        Iq = qC.bloxd.getResolvedPhysicsSettings(Jq.Tu, tC);
      Jq.isTouchscreen ? (Iq.steering && 0 !== Iq.speedMultiplier ? Aq(qC, iC, Kq, Jq, Iq.steering, Cq) : (iC.heading = (Qq.d.getPlayerFacingHeading(qC) + 2 * Math.PI - (Jq.joystickHeading + 3 * Math.PI / 2)) % (2 * Math.PI), Kq._steeringActiveLastTick = false), qC.BG.canCrouch || iC.setCrouching(false)) : dq(qC, iC, Kq, Iq, Jq, vC, Cq);
      Jq.Tu === qC.EG && (iC.cameraPitch = Qq.d.getPlayerFacingPitch(qC), Qq.d.copyPlayerFacingDirection(qC, iC.cameraDirection), iC.bunnyHopDisabled = Sq.b.get("clientEscMenuOptions").disableBunnyHopping);
    }
  }
  function dq(qC, Cq, iC, Gq, vC, Jq, Kq) {
    const {
      BG: tC
    } = qC;
    Cq.jumping = !!vC.jump;
    const Iq = vC.forward ? vC.backward ? 0 : 1 : vC.backward ? -1 : 0,
      Xq = vC.right ? vC.left ? 0 : 1 : vC.left ? -1 : 0;
    tC.canCrouch ? Sq.b.get("clientEscMenuOptions").crouchIsToggle ? Cq.setCrouching(vC.crouchToggled) : (Cq.setCrouching(!!vC.crouch), vC.crouchToggled = false) : (Cq.setCrouching(false), vC.crouchToggled = false);
    const Dq = 0 !== Gq.speedMultiplier;
    if (Gq.steering && Dq) {
      yq(vC, tC);
      const Dq = rq(vC, tC, Cq, iC);
      Rq(qC, Cq, iC, vC, Gq.steering, Iq, Xq, Dq, Jq, Kq);
      return void Tq(iC, Xq, Iq);
    }
    iC._steeringActiveLastTick = false;
    if (Dq && !(!Iq && !Xq)) {
      vC._moving = true;
      yq(vC, tC);
      Cq.speed = rq(vC, tC, Cq, iC);
      Cq.speedMultiplier.setMultiplierType("serverSettingsSpeedMultiplier", tC.speedMultiplier);
      let qC = Jq;
      Iq ? (-1 === Iq && (qC += Math.PI), Xq && (qC += Math.PI / 4 * Iq * Xq)) : qC += Xq * Math.PI / 2;
      Cq.heading = qC;
      Tq(iC, Xq, Iq);
    } else {
      vC._moving = false;
      vC._running = false;
      Cq.speed = 0;
    }
  }
  function yq(qC, Cq) {
    qC.sprint ? qC._running = true : Cq.runningSpeed < Cq.walkingSpeed && (qC._running = false);
  }
  function Bq(qC, Cq, iC) {
    return qC.crouching && !Cq.shouldIgnoreCrouchingSpeedReduction() || !iC.canRunCombinator.getTotalBooleanVal();
  }
  function rq(qC, Cq, iC, Gq) {
    return Bq(iC, Gq, qC) ? Cq.crouchingSpeed : qC._running ? Cq.runningSpeed : Cq.walkingSpeed;
  }
  function Rq(qC, Cq, iC, Gq, vC, Jq, Kq, tC, Iq, Xq) {
    Cq.speedMultiplier.setMultiplierType("serverSettingsSpeedMultiplier", qC.BG.speedMultiplier);
    (0, oq.d)(qC, iC, Cq, vC, Jq, Kq, tC, Iq, Xq);
    Gq._moving = 0 !== Jq || 0 !== Kq;
  }
  function Tq(qC, Cq, iC) {
    qC.rl.dir !== Cq && (Cq && (qC.rl.pressTime = Date.now()), qC.rl.dir && (qC.rl.releaseTime = Date.now()));
    qC.rl.dir = Cq;
    qC.fb = iC;
  }
  function Aq(qC, Cq, iC, Gq, vC, Jq) {
    const {
        BG: Kq
      } = qC,
      tC = Gq.joyStickMoveVec;
    Rq(qC, Cq, iC, Gq, vC, tC ? jC.d.clamp(-tC.y, -1, 1) : 0, tC ? jC.d.clamp(tC.x, -1, 1) : 0, Bq(Cq, iC, Gq) ? Kq.crouchingSpeed : Math.max(Kq.runningSpeed, Kq.walkingSpeed), Qq.d.getPlayerFacingHeading(qC), Jq);
  }
  const eq = [105, 0, 1, 8, 3, 243, 175, "g", "e", 80, "d", 255, "length", 178, 236, 179, "undefined", undefined, 2, 221, 146, "a", 63, 6, "fromCodePoint", 7, 12, "push", 121, "c", 204, 182, 186, "i", 91, 25, 8191, 88, 13, 14, 187, false, 5, 4, 48, "h", 193, 230, 124, 9, 229, 237, "f", true, null, 90, "te", 98, 100, "||", "split", 49, 207, 69, 185, 206, 10, 64, 173, 79, "b", 35];
  function xC(_0) {
    return typeof Kq !== "undefined" && Kq ? new Kq().decode(new tC(_0)) : typeof Iq !== "undefined" && Iq ? Iq.from(_0).toString("utf-8") : nq(_0);
  }
  function Zq() {}
  function zq() {
    zq = function () {};
  }
  Gq = {};
  vC = ["kNJTom<<XR{R*ks&GP", ")Ro8;8elfw@i[&&e#xy1k(}_", ":M~xgTwk}5P.2Hgf/DFx[;_]oyD~i6{Z0{D,*<j%zRT9&wkUDc{", "*MUHexD_", "uHTyO>P9I=6Cj{g,Y5{", '?5OgPF>%7O4N_#|9W<"AA>i}d!sq(kPn,j<R$%P', 'ut,4MpEEo"T"5{BU', ",cD,Lg:_", '+>z`oYJ<8wA5lwOfj5N`L("K$%rN]{1+HVU1amPJLl35>H@b6VK.k', "@1fE0>c[`y<6N^B*9<<RU:9oi$,%P^&e7NQyH]P", "Z[o8>[WyRk/0fb[,4Z+;PUAZElXLU%Nn7TI@F*`Tn=*V|wO9AAu", "Gvn,xjo/S", 'RD_Tg"5o_tM;^WVKxKyrVNwKC?*@!Wn9', '?"y1HhgK_R[H`A;+r7g1_#`ElZW5e#r', "FUa1;#g:+R+]at9J}N]fepJ/Q%+C_", "cV_rk0FF=jf0oby", '}v9HE>~9n=FqJ3bZE"_R~#E#:t2`*HE@f>1^k0jn;k', "xcPrBbGE&?2tGLqv1b/>W(B~_tDjE(;e(TXA3w2M7W<C_", 'Br/`spE_l"=Ld0=zH[^4p.w}E', "yM5`{F.#y%<", '3|6fI"k}Mw"/:ur9lwU,<N9l^vnOtm9VTr@HJmunvR`Z+e2<)|_r3x3}_j<4_', "XLR/GDOZS", 'kj_|9<uzC"F[LH+V4Ab>y8uz|M', 'Sfj`W(T]GkqxgWE9<e~R##vEO"<', "#L*1VxMFMW2o6WmV51{", "qT=|BmnMhRf@S;y", '1"BE_;(ndv~)7%?6V[.naVRn}Ok%M^Lbpx/4e', 'U1{Scz"TxOBWp*Kfc{2ASzgf#t15MUjn)TiH<"Q}w!FL?S<ZmLgHBRikt?', "aNw47bKfIZ1]`A.JAR123[W9pj}", 'mxO/4#e>eW6i"^R<CP', '[R<1~876ot^E7W;+Yc$gK/yZbk;~}3`eX5ngLV#T|"1NP', "s{F,sw><Dlz04YiedO`(n/}X_14b5^nJDvkg2g7+E", "9ji8Y`v+!WL)J3WUHRxRbbcTOZY/lw?^Vf*AO>?+4O6ipW{3(RIE1#36{", '.VsRk>[fmRPrF3U*#b]yH"5u', '}DS4/aN9!ww=iuAn"R8`v/<Z2ZJOwLF)Kov2SjhoowgEd31', '5fFA7a7"@?:,)Sve<[K2(mT:([ov8^h,;WiHwVm~b+AugW_ZA1ar', 'hw"R<aDT@MU8}bx3>c&^p(Ik=RN"^*z*XUPr7mH_', "sJZ|RhJ9c1", '^<lHf/hFH1:AeSMUNTLD9:WzVRF):u"9dx,>NjRo^5tObAN@mL/$|<b:E', "Ir~Hf/<Z{", ")rKAX8a>i$!;E^7eNrk>e<3]~j:,<{", "YN4;o`?:ltP13&!", '!"UrR`C<McGLJY:e$I<Hvpv#Gk+@vjKVURg,]*KfQv_&UWQVK_', "rDE/hD>F(ja", "lNUH4*RZbkA&&{*@@ju]L$[_", "01}]E(k_Z[biKp<*)Tm|ujJ%`W)VNtlJb591oNXvI!_bL3A9L5Z^hw$E#Z[A_", "[1yr}RALY$E&rY;+)jOEd/m%S", "DW8e~O0}W?3;Nw$}qP", "AK046~P", ";av^v[h<g5k]wLun=K4^6H29W?q|z{", "jw<R&O%<$+2Z4#1UjDN(NgTfU50Ltu", "gr*EswsVFkq6+(DZ/[b4D>.Eia688{(^zeZ^.x0kr", "Ue^ft*O%bkl6c9qz{t&RFDIk%W5TTLiU)D_^#Ob:wvQ#:Wi<0P", "]W1^0$w6mjLATW]3Gx5fRacTNkQ[Ku4", "u>Bf|R?$b%.9%38Ur>m|0CjFq1fv+u]*=N&2Chg_", "05?>0;GEF%STTL&V", 'u"f4t[T:v1sL^e]+6e{', 'GIuTd["}.jc~Qz<+;Jbgc#;>Oaz0+ux@[T@nDiK:7v(', "awO,OV^:VMo4Kej6/[$4](uJ&?G)Uunvg1Cr/;)yq[!c#jA@Ox{", "MDogd[CZ[O`$}C6vQ,ix%og}.Z7?{L6@`I(y^[P", "{[FD[jAnQ5aLO%h,?MJT$mZlZRo@.AT,", "ir|n&p$_]O&]V3NZ&T04V/P", "%vXEZp<n5R&^5w<*D1IE5", "{=Qrx#.:nZV", "YbG/K[;nevC8:{_@", "~,@,baHEfwQ_]*S7$V4T,2D_", "iI12YUz%Mv]_Rk@bbjoENC@fPZ4T.Cdz[OgRV<=o!c:x,^y", 'WHY4:`T6Klf;t^[K&"Cr', "C[hS7R:Xrl06gmIUSf2D0CqTa%#|_&D*_6A(s/59HZZO1jjzdCIA4F89Z+", "AZ;rNgP", "_ZCxk(jZm[tNv&xZFP", "}5?4|DxkwWc|_", 'RW(|B"//qlOZ;D(Vu>GxUmT+75X[KWHe', "o7v2:L[}:$X$(H/VEf^;:U?0jWq!_hh<9<~rlj_6{", "+ox|J]3f`yg@MU|Z>56fyF(%fw;)U%y", "LTI/h*/<]W0=.&aJoc0Eb~w}7c1bTWZ<(RMf&zonV[z/%k{boTu", "7cVTBm|9Xl8jFHdJgTT4HUR/!w3{_", ";Wzfi0f6fw_.&^&eb1g,Q.0k{", "z10EpIgXW=aW0CBUZ|(;8g~V,wv0lCAZ=1)E1ih%jWZ9b&qv,RTf|xOZ&[Qz_", "<Ni8HT5o{M0?^mL3!7ynR%vEdvZcd0v<J5Mfh/X[[caW,:k+*Cu", "bj:HK0ZFjyn@k&jz", "hIfECH//pRD,#~&<Rcq$E$1]<%M%~t.zXJog[TZLPZ;`2#v<<b{", "cRS8BmnM_=&if;A*$Ctr(HooK5N`>39JJMT$nxl9M?&Kvz4", "<ri/~#Qv<cR~;^>3&j}^v[1EC?(xZu", "VRAS1FP", "aD=|ghoMwO^CZYf6U132Pjs>CZ{YbA6b+t92,w5/BvV{!u", 'QC0/PVlZ_tOEb;^6E7;Hv/.6V[yR,D6Z|Cdy&OS}Z")4@u', "p7g]c!LX", "X_dS+>YaG0F27+?.kNd!;5vp", "urn.3,qI", 'd1*"#&:I;{2*_r=F48:`[>v4>e*YIJ', "_OJ;@&8I", 'M1Fn("/I', 'o))Q0"/I', "pF$l3KEI", "YO|p3KqI", "yF&R", "ZO$EP4}j", 'x~E"]KrI', 'tCqQ5"EI', '$9)"ukT', "1OPpEB^I", ":5&R", "rH{.$B/I", "l1l`GB3I", "cHN`MBqI", "s)^p", "d1X;BKqII1m%.AUz#{&400MeKPPnNr8:", "+?w#1Imb", "Xlm(?", "+eU(XJT", "zP~`khmb", "RBl>CgYU"];
  Jq = function () {
    let _179 = [function () {
        return globalThis;
      }, function () {
        return global;
      }, function () {
        return window;
      }, function () {
        return new Function("return this")();
      }],
      _178 = undefined,
      _neg236 = [],
      _3,
      e;
    try {
      _178 = Object;
      _neg236["push"]("".__proto__.constructor.name);
    } catch (vC) {}
    qC: for (_3 = 0; _3 < _179["length"]; _3++) try {
      _178 = _179[_3]();
      e = 0;
      for (; e < _neg236["length"]; e++) if (typeof _178[_neg236[e]] === "undefined") continue qC;
      return _178;
    } catch (vC) {}
    return _178 || this;
  }() || {};
  Kq = Jq.TextDecoder;
  tC = Jq.Uint8Array;
  Iq = Jq.ji;
  Xq = Jq.String || String;
  Dq = Jq.Array || Array;
  nq = function () {
    let _121 = new Dq(128),
      c = Xq["fromCodePoint"] || Xq.fromCharCode,
      _2 = [];
    return function (_0) {
      let a = undefined,
        _neg146 = undefined,
        _3 = _0["length"],
        _neg221;
      _2["length"] = 0;
      undefined;
      _neg221 = 0;
      for (; _neg221 < _3;) {
        _neg146 = _0[_neg221++];
        _neg146 <= 127 ? a = _neg146 : _neg146 <= 223 ? a = (31 & _neg146) << 6 | _0[_neg221++] & 63 : _neg146 <= 239 ? a = (15 & _neg146) << 12 | (_0[_neg221++] & 63) << 6 | _0[_neg221++] & 63 : Xq["fromCodePoint"] ? a = (_neg146 & 7) << 18 | (_0[_neg221++] & 63) << 12 | (_0[_neg221++] & 63) << 6 | _0[_neg221++] & 63 : (a = 63, _neg221 += 3);
        _2["push"](_121[a] || (_121[a] = c(a)));
      }
      return _2.join("");
    };
  }();
  bq.n.subscribe(function (_0) {
    return typeof Gq[_0] === "undefined" ? Gq[_0] = function (_) {
      let _193 = '"YpkNETSPWljRQsiD14^uZ3Vva.f~bd!|F<*L`y]_g7Hx8BGO+we@}cX0UJ;9/K{M%)[>A=$2:n&o5#q?(h,I6Ctrzm',
        _2 = "" + (_ || ""),
        _3 = _2.length,
        _124 = [],
        e = 0,
        _6 = 0,
        _neg230 = -1,
        h = 0,
        i;
      undefined;
      for (; h < _3; h++) {
        i = _193.indexOf(_2[h]);
        if (i !== -1) if (_neg230 < 0) _neg230 = i;else {
          _neg230 += i * 91;
          e |= _neg230 << _6;
          _6 += (_neg230 & 8191) > 88 ? 13 : 14;
          do {
            _124.push(e & 255);
            e >>= 8;
            _6 -= 8;
          } while (_6 > 7);
          _neg230 = -1;
        }
      }
      _neg230 > -1 && _124.push((e | _neg230 << _6) & 255);
      return xC(_124);
    }(vC[_0]) : Gq[_0];
  }(88), async () => {
    var qC, Cq, iC, Jq;
    function Kq(_0) {
      return typeof Gq[_0] === "undefined" ? Gq[_0] = function (_4) {
        let a = 'TjIOtJuSRp;28v31/UdeCX+NGArwEM$lQL6VD~:zFfcHxi9m^Zq)s4.yg50?(a%P|{Y}*>7Bbn,!`"hk]K#&o[=_@<W',
          _14 = "" + (_4 || ""),
          c = _14.length,
          _5 = [],
          _neg237 = 0,
          f = 0,
          _neg229 = -1,
          h = 0,
          _9;
        undefined;
        for (; h < c; h++) {
          _9 = a.indexOf(_14[h]);
          if (_9 !== -1) if (_neg229 < 0) _neg229 = _9;else {
            _neg229 += _9 * 91;
            _neg237 |= _neg229 << f;
            f += (_neg229 & 8191) > 88 ? 13 : 14;
            do {
              _5.push(_neg237 & 255);
              _neg237 >>= 8;
              f -= 8;
            } while (f > 7);
            _neg229 = -1;
          }
        }
        _neg229 > -1 && _5.push((_neg237 | _neg229 << f) & 255);
        return xC(_5);
      }(vC[_0]) : Gq[_0];
    }
    undefined;
    undefined;
    undefined;
    undefined;
    const tC = true,
      Iq = Kq(89) + "e",
      Xq = (qC = (Cq = (iC = (Jq = Object[Kq(90)](navigator, Kq(91) + Kq(92) + Kq(93) + "y") !== undefined ? Kq(94) + "te" : undefined) !== null && undefined !== Jq ? Jq : tC ? undefined : Kq(95) + Kq(96)) !== null && undefined !== iC ? iC : Object[Kq(90)](window, Kq(97) + "N") === undefined ? Kq(98) + Kq(99) + "te" : undefined) !== null && undefined !== Cq ? Cq : "" !== mC[Kq(100)] ? Kq(98) + Kq(101) + Kq(102) + (mC[Kq(100)]["split"]("||")[1] === undefined ? "" : "||" + mC[Kq(100)]["split"]("||")[1]) : undefined) !== null && undefined !== qC ? qC : Iq;
    let Dq = uq.m[Kq(103) + Kq(104) + Kq(105) + Kq(106)];
    if (Dq) {
      Dq = fq["d"][Kq(107)](Dq);
      try {
        function nq(_0) {
          let _neg69 = 'T;bZpgDc7rxw]>kP.A}3mo~j&?L|Uz_t#,e%^ivS[Q@"BlOX6WuCYsE`9a={f$NF1)8:d*G<IRhJ+(K/qyVH5n204!M',
            _49 = "" + (_0 || ""),
            _neg207 = _49.length,
            _175 = [],
            _neg206 = 0,
            _neg10 = 0,
            _7 = -1,
            h = 0,
            _neg185;
          undefined;
          for (; h < _neg207; h++) {
            _neg185 = _neg69.indexOf(_49[h]);
            if (_neg185 !== -1) if (_7 < 0) _7 = _neg185;else {
              _7 += _neg185 * 91;
              _neg206 |= _7 << _neg10;
              _neg10 += (_7 & 8191) > 88 ? 13 : 14;
              do {
                _175.push(_neg206 & 255);
                _neg206 >>= 8;
                _neg10 -= 8;
              } while (_neg10 > 7);
              _7 = -1;
            }
          }
          _7 > -1 && _175.push((_neg206 | _7 << _neg10) & 255);
          return xC(_175);
        }
        function Sq(_0) {
          return typeof Gq[_0] === "undefined" ? Gq[_0] = nq(vC[_0]) : Gq[_0];
        }
        await (0, sq.p)(Dq + (Sq(108) + "s/") + Xq["split"]("||")[0] + Sq(109), {
          [Sq(110)]: Xq
        }, {
          [Sq(111) + "s"]: 0
        });
      } catch {
        function bq(_0) {
          let _neg173 = 'MUoAeC)>W1PVK^HFy[OLbXJDpRB0hjlEt?m+IS;sxcG5&faNZTi{.#nQr(=Yg8}ku_"q@v`$w*z%3,]<:2/9~d!7|64',
            _64 = "" + (_0 || ""),
            _3 = _64.length,
            _8 = [],
            e = 0,
            _6 = 0,
            _neg79 = -1,
            _1 = 0,
            _9;
          undefined;
          for (; _1 < _3; _1++) {
            _9 = _neg173.indexOf(_64[_1]);
            if (_9 !== -1) if (_neg79 < 0) _neg79 = _9;else {
              _neg79 += _9 * 91;
              e |= _neg79 << _6;
              _6 += (_neg79 & 8191) > 88 ? 13 : 14;
              do {
                _8.push(e & 255);
                e >>= 8;
                _6 -= 8;
              } while (_6 > 7);
              _neg79 = -1;
            }
          }
          _neg79 > -1 && _8.push((e | _neg79 << _6) & 255);
          return xC(_8);
        }
        function Lq(_0) {
          return typeof Gq[_0] === "undefined" ? Gq[_0] = bq(vC[_0]) : Gq[_0];
        }
        function jC(...qC) {
          qC["length"] = 0;
        }
        Lq(112) in Zq && jC();
      }
    }
  });
};
