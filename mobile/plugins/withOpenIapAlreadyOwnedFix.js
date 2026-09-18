// expo-iap 4.2.1 pins OpenIAP "apple" 2.1.2 (see
// node_modules/expo-iap/openiap-versions.json). That native module's
// requestPurchase() throws `alreadyOwned` for ANY same-SKU purchase while the
// subscription is active — even when a signed promotional offer (withOffer)
// is attached. That preflight blocks exactly the sharer "Apply reward" flow
// in mobile/lib/referral.ts (`applySharerReward`) / docs/REFERRAL_HANDOFF.md:
// an existing subscriber discounting their OWN next renewal on the SAME
// product. StoreKit itself already validates the signed offer and
// eligibility, so this preflight is redundant (and wrong) for that case.
//
// This app has no committed `ios/` folder (Continuous Native Generation), so
// `openiap` is fetched fresh by CocoaPods on every prebuild and can't be
// patched via patch-package (which only touches node_modules). Instead this
// plugin injects a `post_install` step into the generated Podfile that
// string-patches the pod's checked-out Swift source right after CocoaPods
// downloads it, before Xcode compiles.
//
// Safe by construction: the Ruby only edits the file when it finds the exact
// known line, is idempotent (skips if already patched), and just warns
// (never fails the build) if OpenIAP ever changes this code.
const { withPodfile } = require('expo/config-plugins');

const MARKER_BEGIN = '# @generated begin relentless-openiap-already-owned-fix';
const MARKER_END = '# @generated end relentless-openiap-already-owned-fix';

const POST_INSTALL_SNIPPET = `
    ${MARKER_BEGIN}
    openiap_module = Dir.glob(File.join(installer.sandbox.root.to_s, '**', 'OpenIapModule.swift')).first
    if openiap_module && File.exist?(openiap_module)
      contents = File.read(openiap_module)
      marker = 'if product.type == .autoRenewable {'
      patched_marker = 'if product.type == .autoRenewable && iosProps.withOffer == nil {'
      if contents.include?(patched_marker)
        Pod::UI.puts '[Relentless] OpenIapModule.swift already patched (already-owned + offer fix).'
      elsif contents.include?(marker)
        File.write(openiap_module, contents.sub(marker, patched_marker))
        Pod::UI.puts '[Relentless] Patched OpenIapModule.swift to allow promotional-offer purchases on an already-owned subscription.'
      else
        Pod::UI.warn '[Relentless] OpenIapModule.swift already-owned preflight not found as expected -- openiap version may have changed. Sharer "Apply reward" may fail with already_owned. See mobile/plugins/withOpenIapAlreadyOwnedFix.js.'
      end
    else
      Pod::UI.warn '[Relentless] Could not locate OpenIapModule.swift under Pods to apply already-owned fix.'
    end
    ${MARKER_END}
`;

module.exports = function withOpenIapAlreadyOwnedFix(config) {
  return withPodfile(config, (config) => {
    const contents = config.modResults.contents;

    if (contents.includes(MARKER_BEGIN)) {
      return config;
    }

    const postInstallMatch = contents.match(/post_install do \|installer\|/);
    if (!postInstallMatch) {
      throw new Error(
        '[withOpenIapAlreadyOwnedFix] Could not find `post_install do |installer|` in the generated Podfile.',
      );
    }

    const insertAt = postInstallMatch.index + postInstallMatch[0].length;
    config.modResults.contents =
      contents.slice(0, insertAt) + '\n' + POST_INSTALL_SNIPPET + contents.slice(insertAt);

    return config;
  });
};
