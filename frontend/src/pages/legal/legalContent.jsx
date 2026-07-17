import React from 'react';
import { privacyContactEmail } from '../../lib/legal';

export const TermsContent = () => (
  <>
    <p>
      These Terms govern access to Yumnetwork, including its public website and authorized
      reporting workspace. By using the service, you agree to these Terms, our Privacy Policy, and the applicable
      terms of any third-party platforms you choose to connect.
    </p>
    <p>
      The service helps authorized users connect supported platforms, organize content operations, and review
      channel, messaging, and performance data. When you choose to connect a platform, that provider presents its
      own consent flow and you may deny or revoke access at any time.
    </p>
    <p>
      You may use the service only for lawful business purposes, with authority to connect each account, and in
      accordance with applicable law and the policies of each platform you connect. The private workspace is
      available only to users authorized by the service administrator.
    </p>
    <p>Your responsibilities:</p>
    <ul>
      <li>Keep account credentials confidential and use only your assigned access.</li>
      <li>Connect only platforms and accounts for which you have permission to grant access.</li>
      <li>Do not bypass security controls, permissions, or platform rate limits.</li>
      <li>Do not use the service to publish harmful, deceptive, or unauthorized content.</li>
    </ul>
    <p>
      You can disconnect a platform connection from the management area. Disconnecting revokes the stored
      authorization; deleting a connection may also remove its associated local records. Requests for account or
      data deletion can also be sent to <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>.
    </p>
    <p>
      The service is provided on an "as is" and "as available" basis to the extent permitted by law. We may
      suspend or terminate access for security, policy, or operational reasons, and may update these Terms by
      publishing a revised version on this page.
    </p>
    <p>
      Questions about these Terms can be sent to <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>.
    </p>
  </>
);

export const PrivacyContent = () => (
  <>
    <p>
      This Privacy Policy explains how Yumnetwork collects, uses, retains, and deletes information
      when you use our website, private workspace, and any supported platform connection.
    </p>
    <h2>Information we collect</h2>
    <p>
      We collect the information needed to operate the service: workspace account details (name, email, and role),
      support messages, and operational records such as assignments and reports. If you choose to connect a
      platform, we collect the data approved through that platform&apos;s consent flow, which may include account
      identifiers, profile details, public metrics, messages, and media metadata depending on the platform and
      scopes granted.
    </p>
    <h2>How we use platform data</h2>
    <p>
      We use this data only to connect the authorized platform, synchronize approved content or messaging data,
      display dashboards, assign ownership, and generate internal reports. We do not sell personal information or
      use platform data for advertising or to build unrelated user profiles.
    </p>
    <h2>Sharing and security</h2>
    <ul>
      <li>Access and refresh tokens are processed server-side, encrypted at rest, and never displayed in the workspace.</li>
      <li>Access is limited to authorized workspace users and service providers that host or secure the service.</li>
      <li>We do not share platform data with third parties except as needed to operate the service, comply with law, or with your direction.</li>
    </ul>
    <p>
      We use reasonable administrative and technical safeguards. No system can guarantee absolute security, so you
      should protect your workspace credentials and promptly report suspected misuse.
    </p>
    <h2>Retention and deletion</h2>
    <p>
      We retain platform connection data and synchronized reporting data while the connected workspace is active.
      Disconnecting a platform revokes its authorization and deletes stored tokens. Deleting a connection may remove
      its local channel, message, order, or reporting records depending on the platform. We retain limited backup and
      security logs for up to 90 days, unless a longer period is required by law or needed to resolve a security
      incident.
    </p>
    <h2>Your choices and rights</h2>
    <p>
      Depending on applicable law, you may request access to, correction of, export of, restriction of, or deletion
      of your personal information. You may also revoke platform access in that platform&apos;s settings or from the
      management area. To make a request, email <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>{' '}
      from the account concerned. We may verify your identity and respond within 30 days, subject to applicable law.
    </p>
    <p>
      This policy may change as the service evolves. The latest version is published here. For privacy questions or
      a deletion request, contact <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>.
    </p>
  </>
);

export const DataDeletionContent = () => (
  <>
    <p>
      This page explains how to request deletion of personal data associated with Yumnetwork and
      connected platform accounts.
    </p>
    <h2>How to request deletion</h2>
    <p>
      Send an email to <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a> from the account you want
      reviewed. Include the platform name, the account identifier if you know it, and a clear request to delete your
      data.
    </p>
    <h2>What we delete</h2>
    <p>
      When we receive a valid request, we review the account and delete or disconnect the relevant local data where
      applicable. This may include stored access tokens, connected page records, conversation records, orders,
      knowledge documents, or reporting data linked to the account.
    </p>
    <h2>What may be retained</h2>
    <p>
      We may keep limited records when needed for security, audit, legal, or operational reasons, such as backup logs
      or records required by law. Where deletion is completed, the account will be disconnected from the service.
    </p>
    <h2>Response time</h2>
    <p>
      We aim to respond within 30 days, subject to identity verification and applicable law. If you need to follow up,
      use the same email address above.
    </p>
  </>
);

export const TermsContentVi = () => (
  <>
    <p>
      Các Điều khoản này điều chỉnh việc truy cập Yumnetwork, bao gồm trang web công khai và không gian báo cáo
      được cấp quyền. Khi sử dụng dịch vụ, bạn đồng ý với các Điều khoản này, Chính sách quyền riêng tư và điều
      khoản áp dụng của mọi nền tảng bên thứ ba mà bạn chọn kết nối.
    </p>
    <p>
      Dịch vụ giúp người dùng được cấp quyền kết nối các nền tảng được hỗ trợ, tổ chức hoạt động nội dung và xem
      dữ liệu về kênh, tin nhắn cùng hiệu quả. Khi bạn kết nối một nền tảng, nhà cung cấp đó sẽ hiển thị quy trình
      chấp thuận riêng; bạn có thể từ chối hoặc thu hồi quyền truy cập bất cứ lúc nào.
    </p>
    <p>
      Bạn chỉ được sử dụng dịch vụ cho mục đích kinh doanh hợp pháp, có thẩm quyền kết nối từng tài khoản, tuân thủ
      pháp luật hiện hành và chính sách của từng nền tảng. Không gian làm việc riêng tư chỉ dành cho người dùng được
      quản trị viên dịch vụ cấp quyền.
    </p>
    <p>Trách nhiệm của bạn:</p>
    <ul>
      <li>Bảo mật thông tin đăng nhập và chỉ sử dụng quyền truy cập được cấp cho mình.</li>
      <li>Chỉ kết nối nền tảng và tài khoản mà bạn có quyền cấp phép truy cập.</li>
      <li>Không vượt qua biện pháp bảo mật, quyền hạn hoặc giới hạn tần suất của nền tảng.</li>
      <li>Không dùng dịch vụ để đăng nội dung có hại, lừa đảo hoặc chưa được cấp phép.</li>
    </ul>
    <p>
      Bạn có thể ngắt kết nối nền tảng trong khu vực quản lý. Việc ngắt kết nối sẽ thu hồi quyền đã lưu; việc xóa
      kết nối cũng có thể xóa các bản ghi cục bộ liên quan. Bạn cũng có thể gửi yêu cầu xóa tài khoản hoặc dữ liệu
      tới <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>.
    </p>
    <p>
      Trong phạm vi pháp luật cho phép, dịch vụ được cung cấp theo hiện trạng và khả năng sẵn có. Chúng tôi có thể
      tạm ngừng hoặc chấm dứt quyền truy cập vì lý do bảo mật, chính sách hoặc vận hành, và có thể cập nhật các Điều
      khoản này bằng cách đăng phiên bản sửa đổi trên trang này.
    </p>
    <p>
      Mọi câu hỏi về Điều khoản có thể gửi tới <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>.
    </p>
  </>
);

export const PrivacyContentVi = () => (
  <>
    <p>
      Chính sách quyền riêng tư này giải thích cách Yumnetwork thu thập, sử dụng, lưu giữ và xóa thông tin khi bạn
      sử dụng trang web, không gian làm việc riêng tư và các kết nối nền tảng được hỗ trợ.
    </p>
    <h2>Thông tin chúng tôi thu thập</h2>
    <p>
      Chúng tôi thu thập thông tin cần thiết để vận hành dịch vụ: thông tin tài khoản trong không gian làm việc
      (tên, email và vai trò), tin nhắn hỗ trợ và các bản ghi vận hành như phân công và báo cáo. Nếu bạn kết nối một
      nền tảng, chúng tôi thu thập dữ liệu được bạn chấp thuận trong quy trình cấp quyền của nền tảng đó. Tùy nền
      tảng và phạm vi quyền, dữ liệu có thể gồm mã tài khoản, thông tin hồ sơ, chỉ số công khai, tin nhắn và siêu dữ
      liệu phương tiện.
    </p>
    <h2>Cách chúng tôi sử dụng dữ liệu nền tảng</h2>
    <p>
      Chúng tôi chỉ dùng dữ liệu để kết nối nền tảng được cấp quyền, đồng bộ dữ liệu nội dung hoặc tin nhắn đã được
      chấp thuận, hiển thị bảng tổng quan, phân công trách nhiệm và tạo báo cáo nội bộ. Chúng tôi không bán thông tin
      cá nhân, không dùng dữ liệu nền tảng cho quảng cáo hoặc xây dựng hồ sơ người dùng không liên quan.
    </p>
    <h2>Chia sẻ và bảo mật</h2>
    <ul>
      <li>Access token và refresh token được xử lý phía máy chủ, mã hóa khi lưu trữ và không hiển thị trong không gian làm việc.</li>
      <li>Quyền truy cập chỉ dành cho người dùng được cấp quyền và nhà cung cấp dịch vụ lưu trữ hoặc bảo vệ hệ thống.</li>
      <li>Chúng tôi không chia sẻ dữ liệu nền tảng với bên thứ ba, trừ khi cần để vận hành dịch vụ, tuân thủ pháp luật hoặc theo chỉ dẫn của bạn.</li>
    </ul>
    <p>
      Chúng tôi áp dụng các biện pháp bảo vệ hành chính và kỹ thuật hợp lý. Không hệ thống nào có thể đảm bảo an toàn
      tuyệt đối; bạn cần bảo vệ thông tin đăng nhập và báo ngay khi nghi ngờ có hành vi sử dụng sai mục đích.
    </p>
    <h2>Lưu giữ và xóa dữ liệu</h2>
    <p>
      Chúng tôi lưu dữ liệu kết nối nền tảng và dữ liệu báo cáo đã đồng bộ khi không gian làm việc được kết nối còn
      hoạt động. Ngắt kết nối sẽ thu hồi quyền và xóa token đã lưu. Xóa kết nối có thể xóa bản ghi cục bộ về kênh,
      tin nhắn, đơn hàng hoặc báo cáo tùy nền tảng. Nhật ký sao lưu và bảo mật giới hạn có thể được lưu tối đa 90
      ngày, trừ khi pháp luật yêu cầu lâu hơn hoặc cần để xử lý sự cố bảo mật.
    </p>
    <h2>Lựa chọn và quyền của bạn</h2>
    <p>
      Tùy pháp luật áp dụng, bạn có thể yêu cầu truy cập, chỉnh sửa, xuất, hạn chế xử lý hoặc xóa thông tin cá nhân.
      Bạn cũng có thể thu hồi quyền nền tảng trong phần cài đặt của nền tảng hoặc khu vực quản lý. Để gửi yêu cầu,
      hãy dùng tài khoản liên quan gửi email tới <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>.
      Chúng tôi có thể xác minh danh tính và phản hồi trong vòng 30 ngày theo pháp luật áp dụng.
    </p>
    <p>
      Chính sách có thể thay đổi khi dịch vụ phát triển; phiên bản mới nhất được đăng tại đây. Với câu hỏi về quyền
      riêng tư hoặc yêu cầu xóa dữ liệu, hãy liên hệ <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>.
    </p>
  </>
);

export const DataDeletionContentVi = () => (
  <>
    <p>
      Trang này giải thích cách yêu cầu xóa dữ liệu cá nhân liên quan đến Yumnetwork và các tài khoản nền tảng đã kết nối.
    </p>
    <h2>Cách yêu cầu xóa dữ liệu</h2>
    <p>
      Gửi email từ tài khoản bạn muốn xem xét tới <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>.
      Hãy nêu tên nền tảng, mã tài khoản nếu có và yêu cầu xóa dữ liệu rõ ràng.
    </p>
    <h2>Dữ liệu chúng tôi xóa</h2>
    <p>
      Khi nhận được yêu cầu hợp lệ, chúng tôi xem xét tài khoản và xóa hoặc ngắt kết nối dữ liệu cục bộ liên quan khi
      phù hợp. Dữ liệu này có thể gồm access token đã lưu, bản ghi Trang đã kết nối, hội thoại, đơn hàng, tài liệu
      trong kho kiến thức hoặc dữ liệu báo cáo liên kết với tài khoản.
    </p>
    <h2>Dữ liệu có thể được lưu lại</h2>
    <p>
      Chúng tôi có thể giữ một số bản ghi giới hạn vì mục đích bảo mật, kiểm toán, pháp lý hoặc vận hành, chẳng hạn
      nhật ký sao lưu hoặc hồ sơ pháp luật yêu cầu. Khi hoàn tất xóa, tài khoản sẽ được ngắt khỏi dịch vụ.
    </p>
    <h2>Thời gian phản hồi</h2>
    <p>
      Chúng tôi cố gắng phản hồi trong vòng 30 ngày, tùy thuộc việc xác minh danh tính và pháp luật áp dụng. Nếu cần
      trao đổi thêm, hãy sử dụng địa chỉ email nêu trên.
    </p>
  </>
);
