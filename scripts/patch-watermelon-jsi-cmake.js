/**
 * WatermelonDB's Android JSI CMakeLists assumes a hoisted node_modules (npm/yarn).
 * bun 1.3 uses an isolated linker and stores packages under node_modules/.pnpm/,
 * so the relative path to react-native/ReactCommon/jsi/jsi/jsi.cpp is wrong.
 * Inject a walk-up resolver. This is a bun layout issue, not a pnpm setup.
 */
const fs = require('fs');
const path = require('path');

const MARKER = 'WMELON_RESOLVE_NODE_MODULES_PNPM';

const INJECTION = `
# ${MARKER}
# bun isolated linker: walk up until react-native JSI sources are found
set(_search_dir "\${CMAKE_CURRENT_SOURCE_DIR}")
set(_resolved_nm "")
foreach(_i RANGE 1 18)
        get_filename_component(_search_dir "\${_search_dir}" DIRECTORY)
        if(EXISTS "\${_search_dir}/react-native/ReactCommon/jsi/jsi/jsi.cpp")
                set(_resolved_nm "\${_search_dir}/")
                break()
        endif()
        if(EXISTS "\${_search_dir}/node_modules/react-native/ReactCommon/jsi/jsi/jsi.cpp")
                set(_resolved_nm "\${_search_dir}/node_modules/")
                break()
        endif()
endforeach()
if(_resolved_nm)
        set(NODE_MODULES_PATH_RN "\${_resolved_nm}")
        if(EXISTS "\${_resolved_nm}/@nozbe/sqlite")
                set(NODE_MODULES_PATH_WM "\${_resolved_nm}")
        endif()
endif()
`;

function findCmake(projectRoot) {
  const cmakePath = path.join(
    projectRoot,
    'node_modules/@nozbe/watermelondb/native/android-jsi/src/main/cpp/CMakeLists.txt'
  );
  if (!fs.existsSync(cmakePath)) return null;
  return fs.realpathSync(cmakePath);
}

function patchCmake(cmakePath) {
  const original = fs.readFileSync(cmakePath, 'utf8');
  if (original.includes(MARKER)) return { patched: false, reason: 'already-patched' };

  const anchor = `endif()

# -------------------------------------------------
# Header search paths`;
  if (!original.includes(anchor)) {
    return { patched: false, reason: 'anchor-not-found' };
  }

  const next = original.replace(
    anchor,
    `endif()
${INJECTION}
# -------------------------------------------------
# Header search paths`
  );
  fs.writeFileSync(cmakePath, next);
  return { patched: true };
}

function patchWatermelonJsiCmake(projectRoot = process.cwd()) {
  const cmakePath = findCmake(projectRoot);
  if (!cmakePath) {
    return { ok: false, reason: 'cmake-not-found' };
  }
  const result = patchCmake(cmakePath);
  return { ok: result.patched || result.reason === 'already-patched', cmakePath, ...result };
}

module.exports = { patchWatermelonJsiCmake };

if (require.main === module) {
  const result = patchWatermelonJsiCmake(path.resolve(__dirname, '..'));
  if (!result.ok) {
    console.warn('[patch-watermelon-jsi-cmake]', result.reason || 'failed');
    process.exit(0);
  }
  console.log(
    '[patch-watermelon-jsi-cmake]',
    result.reason === 'already-patched' ? 'already applied' : `patched ${result.cmakePath}`
  );
}
